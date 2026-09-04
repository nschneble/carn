// SPDX-License-Identifier: AGPL-3.0-or-later

import { type ChildProcessByStdio, spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import type { Readable, Writable } from "node:stream";

import { Semaphore } from "./semaphore.js";

export const gitConcurrency = availableParallelism();

export type GitOutcome = "exited" | "timed-out" | "cancelled";

export type GitResult = {
  code: number | null;
  outcome: GitOutcome;
};

export type GitOptions = {
  args: string[];
  cwd: string;
  timeoutMs: number;
  gitProtocol?: string;
  signal?: AbortSignal;
};

export type GitChild = {
  pid: number | undefined;
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  done: Promise<GitResult>;
};

const semaphore = new Semaphore(gitConcurrency);

function childEnv(gitProtocol: string | undefined): NodeJS.ProcessEnv {
  if (gitProtocol === undefined) {
    return process.env;
  }

  return { ...process.env, GIT_PROTOCOL: gitProtocol };
}

// pipe stdout onward with { end: false } or the ssh exit status is lost
export async function spawnGit(options: GitOptions): Promise<GitChild> {
  options.signal?.throwIfAborted();
  await semaphore.acquire(options.signal);

  // a grant and an abort can land in the same tick; catch it before spawning
  if (options.signal?.aborted === true) {
    semaphore.release();
    throw options.signal.reason;
  }

  // spawn() throws on a NULL in args, cwd, or env before a handler exists
  let child: ChildProcessByStdio<Writable, Readable, Readable>;
  try {
    child = spawn("git", options.args, {
      cwd: options.cwd,
      env: childEnv(options.gitProtocol),
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    semaphore.release();
    throw error;
  }

  let outcome: GitOutcome = "exited";
  let settled = false;

  function kill(reason: GitOutcome): void {
    outcome = reason;
    child.kill("SIGKILL");
  }

  const timer = setTimeout(() => {
    kill("timed-out");
  }, options.timeoutMs);

  const cancel = () => {
    kill("cancelled");
  };

  options.signal?.addEventListener("abort", cancel, { once: true });

  const done = new Promise<GitResult>((resolve, reject) => {
    function finish(settle: () => void): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      semaphore.release();
      settle();
    }

    child.on("error", (error) => {
      finish(() => {
        reject(error);
      });
    });

    child.on("close", (code) => {
      finish(() => {
        resolve({ code, outcome });
      });
    });
  });

  return {
    pid: child.pid,
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    done,
  };
}

export async function runGit(options: GitOptions): Promise<void> {
  const child = await spawnGit(options);
  const command = options.args.join(" ");
  const stderr: Buffer[] = [];

  child.stdout.resume();
  child.stderr.on("data", (chunk: Buffer) => {
    stderr.push(chunk);
  });

  const result = await child.done;

  if (result.outcome === "timed-out") {
    throw new Error(`git ${command} timed out after ${options.timeoutMs}ms`);
  }

  if (result.outcome === "cancelled") {
    throw new Error(`git ${command} was cancelled`);
  }

  if (result.code !== 0) {
    throw new Error(
      `git ${command} exited ${result.code}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
    );
  }
}

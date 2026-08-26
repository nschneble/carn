// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  type GitChild,
  gitConcurrency,
  runGit,
  spawnGit,
} from "../../src/git/spawn.js";

const cwd = tmpdir();
const generous = 30_000;
const impatient = 200;
const bounded = { timeout: 10_000 };
const version2 = "000eversion 2\n";

const dir = mkdtempSync(join(tmpdir(), "carn-git-spawn-"));
const repo = join(dir, "empty.git");

execFileSync("git", ["init", "--bare", "-q", "--", repo]);

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function blocker(
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<GitChild> {
  const child = await spawnGit({
    args: ["hash-object", "--stdin"],
    cwd,
    signal,
    timeoutMs,
  });

  child.stdout.resume();
  child.stderr.resume();

  return child;
}

async function advertise(gitProtocol?: string): Promise<string> {
  const child = await spawnGit({
    args: ["upload-pack", "--advertise-refs", "--", "."],
    cwd: repo,
    gitProtocol,
    timeoutMs: generous,
  });
  const chunks: Buffer[] = [];

  child.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  child.stderr.resume();
  await child.done;

  return Buffer.concat(chunks).toString("utf8");
}

async function release(child: GitChild): Promise<void> {
  child.stdin.end();
  await child.done;
}

test("a git call inside the timeout is untouched", bounded, async () => {
  const child = await spawnGit({
    args: ["--version"],
    cwd,
    timeoutMs: generous,
  });

  child.stdout.resume();
  child.stderr.resume();

  assert.deepStrictEqual(await child.done, { code: 0, outcome: "exited" });
});

test("a git call past the timeout is killed and says so", bounded, async () => {
  const result = await (await blocker(impatient)).done;

  assert.strictEqual(result.outcome, "timed-out");
  assert.strictEqual(result.code, null);

  await assert.rejects(
    runGit({ args: ["hash-object", "--stdin"], cwd, timeoutMs: impatient }),
    /timed out after 200ms/,
  );
});

test(
  "an abandoned git call is killed and says it was cancelled",
  bounded,
  async () => {
    const abandoned = new AbortController();
    const child = await blocker(generous, abandoned.signal);

    await delay(50);
    abandoned.abort();

    assert.deepStrictEqual(await child.done, {
      code: null,
      outcome: "cancelled",
    });
  },
);

test("the git protocol reaches the child's environment", bounded, async () => {
  const asked = await advertise("version=2");
  const unset = await advertise();

  assert.ok(
    asked.startsWith(version2),
    `GIT_PROTOCOL did not reach git: ${JSON.stringify(asked.slice(0, 40))}`,
  );
  assert.ok(
    !unset.startsWith(version2),
    "git answered version 2 with no GIT_PROTOCOL asked for",
  );
});

test(
  "the concurrency cap queues the next call until a slot frees",
  bounded,
  async () => {
    const running: GitChild[] = [];

    for (let i = 0; i < gitConcurrency; i += 1) {
      running.push(await blocker(generous));
    }

    let spawned = false;
    const queued = blocker(generous).then((child) => {
      spawned = true;

      return child;
    });

    await delay(250);
    assert.strictEqual(spawned, false, "the cap did not queue the next call");

    const first = running.shift();
    assert.ok(first);
    await release(first);

    running.push(await queued);
    assert.strictEqual(spawned, true);

    for (const child of running) {
      await release(child);
    }
  },
);

test(
  "a synchronous spawn failure hands its slot to the queue",
  bounded,
  async () => {
    const running: GitChild[] = [];

    for (let i = 0; i < gitConcurrency; i += 1) {
      running.push(await blocker(generous));
    }

    const failing = assert.rejects(
      spawnGit({
        args: ["--version"],
        cwd,
        gitProtocol: "version=2\0",
        timeoutMs: generous,
      }),
      { code: "ERR_INVALID_ARG_VALUE" },
    );

    let spawned = false;
    const queued = blocker(generous).then((child) => {
      spawned = true;

      return child;
    });

    const first = running.shift();
    assert.ok(first);
    await release(first);
    await failing;

    await delay(250);
    assert.strictEqual(spawned, true, "the failed spawn leaked its slot");

    running.push(await queued);

    for (const child of running) {
      await release(child);
    }
  },
);

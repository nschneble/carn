// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawnGit } from "./spawn.js";

export type Capture = {
  code: number | null;
  stdout: Buffer;
};

export type CaptureOptions = {
  args: string[];
  cwd: string;
  timeoutMs: number;
  limit?: number;
  signal?: AbortSignal;
};

export async function captureGit(options: CaptureOptions): Promise<Capture> {
  const child = await spawnGit({
    args: options.args,
    cwd: options.cwd,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });

  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const chunks: Buffer[] = [];
  let kept = 0;

  // the stream stays flowing past the limit, or the child deadlocks on a
  // full stdout pipe and only the timeout ends it
  child.stdout.on("data", (chunk: Buffer) => {
    const room = limit - kept;
    if (room <= 0) return;

    const slice = chunk.length <= room ? chunk : chunk.subarray(0, room);
    chunks.push(slice);
    kept += slice.length;
  });
  child.stderr.resume();

  const result = await child.done;
  const command = options.args.join(" ");

  if (result.outcome === "timed-out") {
    throw new Error(`git ${command} timed out after ${options.timeoutMs}ms`);
  }

  if (result.outcome === "cancelled") {
    throw new Error(`git ${command} was cancelled`);
  }

  return { code: result.code, stdout: Buffer.concat(chunks) };
}

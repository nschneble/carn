// SPDX-License-Identifier: AGPL-3.0-or-later

import { oidPattern } from "./oid.js";
import { spawnGit } from "./spawn.js";

export const blobTimeoutMs = 5_000;

export async function readBlob(options: {
  repoPath: string;
  oid: string;
  limit: number;
  signal?: AbortSignal;
}): Promise<Buffer> {
  if (!oidPattern.test(options.oid)) {
    throw new Error(`a blob read needs an object id, got ${options.oid}`);
  }

  const child = await spawnGit({
    args: ["cat-file", "blob", options.oid],
    cwd: options.repoPath,
    signal: options.signal,
    timeoutMs: blobTimeoutMs,
  });

  const chunks: Buffer[] = [];
  let kept = 0;

  // the stream stays flowing past the limit, or the child deadlocks on a
  // full stdout pipe and only the timeout ends it
  child.stdout.on("data", (chunk: Buffer) => {
    const room = options.limit - kept;
    if (room <= 0) return;

    const slice = chunk.length <= room ? chunk : chunk.subarray(0, room);
    chunks.push(slice);
    kept += slice.length;
  });
  child.stderr.resume();

  const result = await child.done;
  if (result.outcome !== "exited" || result.code !== 0) {
    throw new Error(
      `git cat-file of ${options.oid} ${result.outcome} (${result.code})`,
    );
  }

  return Buffer.concat(chunks);
}

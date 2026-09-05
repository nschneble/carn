// SPDX-License-Identifier: AGPL-3.0-or-later

import { captureGit } from "./capture.js";
import { oidPattern } from "./oid.js";

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

  const { code, stdout } = await captureGit({
    args: ["cat-file", "blob", options.oid],
    cwd: options.repoPath,
    limit: options.limit,
    signal: options.signal,
    timeoutMs: blobTimeoutMs,
  });

  if (code !== 0) {
    throw new Error(`git cat-file of ${options.oid} exited ${code}`);
  }

  return stdout;
}

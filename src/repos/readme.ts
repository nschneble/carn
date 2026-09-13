// SPDX-License-Identifier: AGPL-3.0-or-later

import { readBlob } from "../git/blob.js";
import type { TreeEntry } from "./tree.js";

export const maxReadmeBytes = 512 * 1024;
const readmeName = "readme.md";

export function findReadme(entries: TreeEntry[]): TreeEntry | null {
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    if (entry.name.toLowerCase() !== readmeName) continue;

    return entry;
  }

  return null;
}

export async function readReadme(options: {
  repoPath: string;
  oid: string;
  signal?: AbortSignal;
}): Promise<string> {
  const body = await readBlob({
    repoPath: options.repoPath,
    oid: options.oid,
    limit: maxReadmeBytes,
    signal: options.signal,
  });

  return body.toString("utf8");
}

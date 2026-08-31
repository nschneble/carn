// SPDX-License-Identifier: AGPL-3.0-or-later

// the root tree at the default branch tip, in one ls-tree; a per-row
// cat-file is pixel-identical and four times slower, which is why
// CLAUDE.md holds a render to fewer than twelve spawns

import { captureGit } from "../git/capture.js";
import { parseLsTree } from "../git/ls-tree.js";
import { oidPattern } from "../git/oid.js";

export type TreeEntry = {
  name: string;
  oid: string;
  directory: boolean;
  bytes: number | null;
};

export const treeTimeoutMs = 5_000;

// refs/heads/ prefixed so a branch name can never arrive as an option
export async function resolveTip(options: {
  repoPath: string;
  branch: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const { code, stdout } = await captureGit({
    args: [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${options.branch}^{commit}`,
    ],
    cwd: options.repoPath,
    signal: options.signal,
    timeoutMs: treeTimeoutMs,
  });

  if (code !== 0) return null;

  const oid = stdout.toString("utf8").trim();
  return oidPattern.test(oid) ? oid : null;
}

function parse(listing: string): TreeEntry[] {
  return parseLsTree(listing).map(({ type, oid, size, path }) => ({
    name: path,
    oid,
    directory: type === "tree",
    bytes: size,
  }));
}

function order(a: TreeEntry, b: TreeEntry): number {
  if (a.directory !== b.directory) return a.directory ? -1 : 1;
  return a.name < b.name ? -1 : 1;
}

export async function listTree(options: {
  repoPath: string;
  commit: string;
  signal?: AbortSignal;
}): Promise<TreeEntry[]> {
  if (!oidPattern.test(options.commit)) {
    throw new Error(`a tree listing needs an object id, got ${options.commit}`);
  }

  const { code, stdout } = await captureGit({
    args: ["ls-tree", "-z", "--long", options.commit, "--"],
    cwd: options.repoPath,
    signal: options.signal,
    timeoutMs: treeTimeoutMs,
  });

  if (code !== 0) {
    throw new Error(`git ls-tree of ${options.commit} exited ${code}`);
  }

  return parse(stdout.toString("utf8")).sort(order);
}

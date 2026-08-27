// SPDX-License-Identifier: AGPL-3.0-or-later

// the root tree at the default branch tip, in one ls-tree. a per-row
// cat-file is pixel-identical and four times slower, which is the whole
// reason CLAUDE.md caps a render at twelve spawns

import { spawnGit } from "../git/spawn.js";

export type TreeEntry = {
  name: string;
  oid: string;
  directory: boolean;
  bytes: number | null;
};

export const treeTimeoutMs = 5_000;

const oidPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

async function read(options: {
  args: string[];
  cwd: string;
  signal: AbortSignal | undefined;
}): Promise<{ code: number | null; stdout: string }> {
  const child = await spawnGit({
    args: options.args,
    cwd: options.cwd,
    signal: options.signal,
    timeoutMs: treeTimeoutMs,
  });

  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  child.stderr.resume();

  const result = await child.done;
  if (result.outcome !== "exited") {
    throw new Error(`git ${options.args[0]} ${result.outcome}`);
  }

  return { code: result.code, stdout: Buffer.concat(chunks).toString("utf8") };
}

// refs/heads/ prefixed so a branch name can never arrive as an option
export async function resolveTip(options: {
  repoPath: string;
  branch: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const { code, stdout } = await read({
    args: [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${options.branch}^{commit}`,
    ],
    cwd: options.repoPath,
    signal: options.signal,
  });

  if (code !== 0) return null;

  const oid = stdout.trim();
  return oidPattern.test(oid) ? oid : null;
}

function parse(listing: string): TreeEntry[] {
  const entries: TreeEntry[] = [];

  for (const record of listing.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab === -1) continue;

    const [, type, oid, size] = record.slice(0, tab).split(/\s+/);
    const name = record.slice(tab + 1);
    if (type === undefined || oid === undefined || name === "") continue;

    const bytes = Number(size);
    entries.push({
      name,
      oid,
      directory: type === "tree",
      bytes: Number.isInteger(bytes) ? bytes : null,
    });
  }

  return entries;
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

  const { code, stdout } = await read({
    args: ["ls-tree", "-z", "--long", options.commit, "--"],
    cwd: options.repoPath,
    signal: options.signal,
  });

  if (code !== 0) {
    throw new Error(`git ls-tree of ${options.commit} exited ${code}`);
  }

  return parse(stdout).sort(order);
}

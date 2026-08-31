// SPDX-License-Identifier: AGPL-3.0-or-later

// a tree listing at the root or below it: one ls-tree for the entries and
// one bounded log for the subject and age columns. a cat-file or a log per
// row is pixel-identical and an order of magnitude slower, which is why
// CLAUDE.md holds a render to fewer than twelve spawns

import { captureGit } from "../git/capture.js";
import { parseLsTree } from "../git/ls-tree.js";
import { oidPattern } from "../git/oid.js";
import { validPath, validRev } from "./blob-view.js";
import { maxSubjectChars } from "./log.js";

export type TreeEntryKind = "file" | "directory" | "gitlink";

export type Touch = { subject: string; at: Date };

export type TreeEntry = {
  name: string;
  oid: string;
  kind: TreeEntryKind;
  bytes: number | null;
  touched: Touch | null;
};

export type Tree = {
  path: string;
  entries: TreeEntry[];
};

export const treeTimeoutMs = 5_000;

// far enough back to attribute a working tree's worth of entries, and a
// bound rather than a promise: a path the walk never reaches renders blank
export const treeWalkCap = 100;

const gitlinkMode = "160000";

// --end-of-options makes a bare trailing -- a pathspec in its own right,
// which matches nothing: ls-tree needs a real one, and the root's is "."
const wholeTree = ".";
const bytesPerCommit = 16 * 1024;

// a record opening with SOH is a commit header, not a status letter, which
// a file named forty hex characters would otherwise imitate
const headerMark = String.fromCharCode(1);
const logFormat = "%x01%H%x00%at%x00%s";

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

function kindOf(mode: string, type: string): TreeEntryKind {
  if (mode === gitlinkMode) return "gitlink";
  return type === "tree" ? "directory" : "file";
}

function rank(entry: TreeEntry): number {
  return entry.kind === "directory" ? 0 : 1;
}

// three kinds and two ranks: comparing the kinds answers "after" to both
// file-before-gitlink and gitlink-before-file, and a sort on an
// inconsistent comparator orders by whatever it was handed. exported
// because ls-tree hands this its entries in name order already, so no
// input the parser can produce would show the difference
export function orderTreeEntries(a: TreeEntry, b: TreeEntry): number {
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return a.name < b.name ? -1 : 1;
}

function parse(listing: string, prefix: string): TreeEntry[] {
  const entries: TreeEntry[] = [];

  for (const { mode, type, oid, size, path } of parseLsTree(listing)) {
    if (!path.startsWith(prefix)) continue;

    const name = path.slice(prefix.length);
    if (name === "" || name.includes("/")) continue;

    entries.push({
      name,
      oid,
      kind: kindOf(mode, type),
      bytes: size,
      touched: null,
    });
  }

  return entries.sort(orderTreeEntries);
}

// one walk for the whole listing, newest first, stopping as soon as every
// entry has a commit. the pathspec narrows the diff and lets git's history
// simplification skip commits that never touched this directory
async function attribute(options: {
  repoPath: string;
  rev: string;
  prefix: string;
  entries: TreeEntry[];
  cap: number;
  signal?: AbortSignal;
}): Promise<void> {
  const { prefix, entries, cap } = options;
  const pending = new Map(entries.map((entry) => [entry.name, entry]));

  const { code, stdout } = await captureGit({
    args: [
      "log",
      "-z",
      "--name-status",
      `--format=${logFormat}`,
      `--max-count=${cap}`,
      "--end-of-options",
      options.rev,
      "--",
      ...(prefix === "" ? [] : [prefix]),
    ],
    cwd: options.repoPath,
    signal: options.signal,
    limit: cap * bytesPerCommit,
    timeoutMs: treeTimeoutMs,
  });

  if (code !== 0) return;

  // the last element is the tail after the final separator: empty on a
  // whole capture, a half-written record on one the byte limit cut short
  const records = stdout.toString("utf8").split("\0");
  records.pop();

  let touched: Touch | null = null;
  let index = 0;

  while (index < records.length && pending.size > 0) {
    const record = records[index] as string;

    // the newline opens a commit's status block; later statuses carry none
    const field = record.startsWith("\n") ? record.slice(1) : record;

    if (field.startsWith(headerMark)) {
      const seconds = Number(records[index + 1]);
      const subject = records[index + 2];
      index += 3;

      touched = Number.isFinite(seconds)
        ? {
            subject: (subject ?? "").slice(0, maxSubjectChars),
            at: new Date(seconds * 1000),
          }
        : null;
      continue;
    }

    // a rename or a copy names the source first and the result second
    const renamed = field.startsWith("R") || field.startsWith("C");
    const path = records[index + (renamed ? 2 : 1)];
    index += renamed ? 3 : 2;

    if (touched === null || path === undefined) continue;
    if (!path.startsWith(prefix)) continue;

    const name = path.slice(prefix.length).split("/")[0] as string;
    const entry = pending.get(name);
    if (entry === undefined) continue;

    entry.touched = touched;
    pending.delete(name);
  }
}

export async function listTree(options: {
  repoPath: string;
  rev: string;
  path?: string;
  cap?: number;
  signal?: AbortSignal;
}): Promise<Tree | null> {
  const { repoPath, rev, path = "", signal } = options;
  if (!validRev(rev)) return null;
  if (path !== "" && !validPath(path)) return null;

  const prefix = path === "" ? "" : `${path}/`;

  const { code, stdout } = await captureGit({
    args: [
      "ls-tree",
      "-z",
      "--long",
      "--end-of-options",
      rev,
      "--",
      prefix === "" ? wholeTree : prefix,
    ],
    cwd: repoPath,
    signal,
    timeoutMs: treeTimeoutMs,
  });

  if (code !== 0) return null;

  const entries = parse(stdout.toString("utf8"), prefix);

  // git has no empty directories, so nothing under a path means it is not
  // a tree: a blob, a gitlink, and an absent path all land here
  if (path !== "" && entries.length === 0) return null;

  if (entries.length > 0) {
    await attribute({
      repoPath,
      rev,
      prefix,
      entries,
      cap: options.cap ?? treeWalkCap,
      signal,
    });
  }

  return { path, entries };
}

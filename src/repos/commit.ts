// SPDX-License-Identifier: AGPL-3.0-or-later

// three spawns whatever the commit touches: metadata, the numstat file
// list, and one patch for every file. the message is read on its own call
// rather than folded into the numstat format, so a NUL a crafted message
// carries cannot inject a row into the file list

import { captureGit } from "../git/capture.js";
import { oidPattern } from "../git/oid.js";

export type DiffFile = {
  path: string;
  from: string | null;
  added: number | null;
  deleted: number | null;
  patch: string | null;
};

export type CommitDetail = {
  sha: string;
  parents: string[];
  author: string;
  at: Date;
  signature: string;
  subject: string;
  body: string;
  files: DiffFile[];
};

export const commitTimeoutMs = 5_000;

// a message longer than this is not a message, and the page carries it in
// full above the diffs
export const maxMessageChars = 20_000;

// far past what any page can inline: the budget cuts the diffs long
// before this does, and this only bounds what one commit may buffer
export const maxPatchBytes = 4 * 1024 * 1024;

const metaFormat = "%P%x00%an%x00%at%x00%G?%x00%B";

const commonArgs = [
  "-r",
  "-M",
  "--root",
  "--diff-merges=first-parent",
  "--no-commit-id",
];

function count(field: string): number | null {
  if (!/^\d+$/.test(field)) return null;
  return Number(field);
}

// a path may hold a tab, so the two counts are taken by offset and
// everything after the second tab is the path
function record(
  entry: string,
): { added: string; deleted: string; rest: string } | null {
  const first = entry.indexOf("\t");
  if (first === -1) return null;

  const second = entry.indexOf("\t", first + 1);
  if (second === -1) return null;

  return {
    added: entry.slice(0, first),
    deleted: entry.slice(first + 1, second),
    rest: entry.slice(second + 1),
  };
}

// a detected rename leaves the path field empty and spends the next two
// fields on the source and the destination
function parseNumstat(listing: string): DiffFile[] {
  const fields = listing.split("\0");
  const files: DiffFile[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const parsed = record(fields[index] as string);
    if (parsed === null) continue;

    const renamed = parsed.rest === "";
    const from = renamed ? (fields[index + 1] ?? null) : null;
    const path = renamed ? (fields[index + 2] ?? "") : parsed.rest;

    if (renamed) index += 2;
    if (path === "") continue;

    files.push({
      path,
      from,
      added: count(parsed.added),
      deleted: count(parsed.deleted),
      patch: null,
    });
  }

  return files;
}

// diff-tree walks the same queue for --numstat and for -p, so the patch
// segments pair with the rows by position and no path is re-parsed
function splitPatches(patch: string): string[] {
  if (patch === "") return [];

  const segments = patch.split(/(?=^diff --git )/m);
  return segments[0] === "" ? segments.slice(1) : segments;
}

async function loadMeta(options: {
  repoPath: string;
  sha: string;
  signal?: AbortSignal;
}): Promise<Omit<CommitDetail, "files"> | null> {
  const { code, stdout } = await captureGit({
    args: [
      "rev-list",
      "-1",
      `--format=${metaFormat}`,
      "--end-of-options",
      options.sha,
      "--",
    ],
    cwd: options.repoPath,
    signal: options.signal,
    limit: maxMessageChars * 4,
    timeoutMs: commitTimeoutMs,
  });

  if (code !== 0) return null;

  // a tree or a blob oid exits 0 and prints nothing, so the body is the
  // oracle for "that id is a commit", never the exit code
  const listing = stdout.toString("utf8");
  const start = listing.indexOf("\n");
  if (start === -1) return null;

  const [parents, author, seconds, signature, message] = listing
    .slice(start + 1)
    .split("\0");

  if (
    parents === undefined ||
    author === undefined ||
    seconds === undefined ||
    signature === undefined ||
    message === undefined
  ) {
    return null;
  }

  const text = message.slice(0, maxMessageChars).replace(/\n+$/, "");
  const split = text.indexOf("\n");

  return {
    sha: options.sha,
    parents: parents.split(" ").filter((parent) => oidPattern.test(parent)),
    author,
    at: new Date(Number(seconds) * 1000),
    signature,
    subject: split === -1 ? text : text.slice(0, split),
    body: split === -1 ? "" : text.slice(split + 1).replace(/^\n+/, ""),
  };
}

export async function loadCommit(options: {
  repoPath: string;
  sha: string;
  signal?: AbortSignal;
}): Promise<CommitDetail | null> {
  const { repoPath, sha, signal } = options;
  if (!oidPattern.test(sha)) return null;

  const meta = await loadMeta({ repoPath, sha, signal });
  if (meta === null) return null;

  const listing = await captureGit({
    args: [
      "diff-tree",
      ...commonArgs,
      "--numstat",
      "-z",
      "--end-of-options",
      sha,
      "--",
    ],
    cwd: repoPath,
    signal,
    timeoutMs: commitTimeoutMs,
  });

  if (listing.code !== 0) return null;

  const files = parseNumstat(listing.stdout.toString("utf8"));
  if (files.length === 0) return { ...meta, files };

  const patches = await captureGit({
    args: ["diff-tree", ...commonArgs, "-p", "--end-of-options", sha, "--"],
    cwd: repoPath,
    signal,
    limit: maxPatchBytes,
    timeoutMs: commitTimeoutMs,
  });

  if (patches.code !== 0) return { ...meta, files };

  const segments = splitPatches(patches.stdout.toString("utf8"));

  // a capture that filled its cap ends mid-hunk, so the last segment is
  // dropped rather than inlined half-rendered
  const whole =
    patches.stdout.length < maxPatchBytes
      ? segments.length
      : segments.length - 1;

  return {
    ...meta,
    files: files.map((file, index) => ({
      ...file,
      patch: index < whole ? (segments[index] ?? null) : null,
    })),
  };
}

// the hunks alone: the path is already the heading above the block, and a
// segment with no hunk at all is a rename, a mode change, or a binary
export function hunks(patch: string | null): string | null {
  if (patch === null) return null;

  const at = patch.search(/^@@ /m);
  if (at === -1) return null;

  return patch.slice(at).replace(/\n$/, "");
}

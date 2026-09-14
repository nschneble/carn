// SPDX-License-Identifier: AGPL-3.0-or-later

// one git log per page

import { captureGit } from "../git/capture.js";
import { oidPattern } from "../git/oid.js";
import { validRev } from "./blob-view.js";

export type Commit = {
  sha: string;
  subject: string;
  at: Date;
};

export type CommitLog = {
  ref: string;
  commits: Commit[];
  next: string | null;
};

export const logRowCap = 16;
export const logTimeoutMs = 5_000;

// sixteen characters longer would carry the page past its budget
export const maxSubjectChars = 500;

const bytesPerCommit = 8192;

function parse(listing: string, cap: number): Commit[] {
  const commits: Commit[] = [];

  for (const record of listing.split("\n")) {
    const [sha, seconds, subject] = record.split("\0");
    if (sha === undefined) continue;
    if (seconds === undefined) continue;
    if (subject === undefined) continue;
    if (!oidPattern.test(sha)) continue;

    commits.push({
      sha,
      subject: subject.slice(0, maxSubjectChars),
      at: new Date(Number(seconds) * 1000),
    });

    if (commits.length === cap) break;
  }

  return commits;
}

export async function loadCommitLog(options: {
  repoPath: string;
  ref: string;
  from?: string | null;
  cap?: number;
  signal?: AbortSignal;
}): Promise<CommitLog | null> {
  const { repoPath, ref, from = null, signal } = options;
  const cap = options.cap ?? logRowCap;

  if (!validRev(ref)) return null;
  if (from !== null && !oidPattern.test(from)) return null;

  const { code, stdout } = await captureGit({
    args: [
      "log",
      `--max-count=${cap + 1}`,
      "--format=%H%x00%at%x00%s",
      "--end-of-options",
      from ?? ref,
      "--",
    ],
    cwd: repoPath,
    signal,
    limit: (cap + 1) * bytesPerCommit,
    timeoutMs: logTimeoutMs,
  });

  if (code !== 0) return null;

  const walked = parse(stdout.toString("utf8"), cap + 1);
  const commits = walked.slice(0, cap);
  const boundary = walked[cap];

  return { ref, commits, next: boundary?.sha ?? null };
}

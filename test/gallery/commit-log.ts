// SPDX-License-Identifier: AGPL-3.0-or-later

import { commitLogPage } from "../../src/html/commit-log.js";
import type { CommitLog } from "../../src/repos/log.js";
import { frozenNow } from "../support/fixture-repos.js";

export const logNow = new Date(frozenNow);

const subjects = [
  "Read the list back",
  "Fetch on a timer rather than on a page load",
  "Drop the second index; one covers both reads",
  "Say what a failed fetch did, then what to do",
  "Pin the reading list to one table",
  "Serve the archive page without a client bundle",
  "Move the digest out of the request path",
  "Name the columns the way the API does",
  "Refuse a url longer than the column",
  "Stop the retry loop after the third failure",
  "Give the empty list the push command",
  "Collapse the two fetch helpers into one",
  "Take the port from the environment",
  "Escape the title before it reaches the page",
  "Keep the tarball byte-reproducible",
  "Cut the reader down to one query",
  "Write the migration in one transaction",
  "Answer a HEAD the way a GET does",
];

function sha(index: number): string {
  return index.toString(16).padStart(2, "0").repeat(20);
}

export function commits(count: number, offset = 0): CommitLog["commits"] {
  return Array.from({ length: count }, (_, index) => ({
    sha: sha(offset + index + 1),
    subject: subjects[(offset + index) % subjects.length] as string,
    at: new Date(logNow.getTime() - (offset + index + 1) * 3_600_000),
  }));
}

export function log(options: Partial<CommitLog> = {}): CommitLog {
  return {
    ref: "main",
    commits: commits(16),
    next: sha(17),
    ...options,
  };
}

export function logDocument(
  options: {
    repo?: string;
    log?: CommitLog;
    from?: string | null;
    back?: string[];
  } = {},
): string {
  return commitLogPage({
    repo: options.repo ?? "linklater",
    log: options.log ?? log(),
    now: logNow,
    from: options.from ?? null,
    back: options.back ?? [],
  });
}

// SPDX-License-Identifier: AGPL-3.0-or-later

// one for-each-ref per list. creatordate is the only date field populated
// for both a commit and a tag object, and contents:subject is the subject
// of whichever of the two the ref names, so neither list needs a second
// spawn to fill its columns

import { captureGit } from "../git/capture.js";
import { maxSubjectChars } from "./log.js";

export type RefKind = "branch" | "tag";

export type Ref = {
  name: string;
  subject: string;
  at: Date;
  annotated: boolean;
};

export type RefList = {
  kind: RefKind;
  refs: Ref[];
  more: boolean;
};

export const refTimeoutMs = 5_000;

// a bound on the read, not on the page: what the list renders is settled
// against the weight budget, in ref-list.ts
export const maxRefs = 250;

const bytesPerRef = 1024;

const namespaces: Record<RefKind, string> = {
  branch: "refs/heads/",
  tag: "refs/tags/",
};

function parse(listing: string): Ref[] {
  const refs: Ref[] = [];

  for (const record of listing.split("\n")) {
    const [name, subject, seconds, objecttype] = record.split("\0");
    if (
      name === undefined ||
      subject === undefined ||
      seconds === undefined ||
      objecttype === undefined
    ) {
      continue;
    }

    // a tag can name a blob or a tree, and creatordate is empty on both.
    // Number("") is 0, so an unguarded row would date itself to 1970 —
    // and there is no log to scope a row that names no commit to
    const at = Number(seconds);
    if (name === "" || seconds === "" || !Number.isFinite(at)) continue;

    refs.push({
      name,
      subject: subject.slice(0, maxSubjectChars),
      at: new Date(at * 1000),
      annotated: objecttype === "tag",
    });
  }

  return refs;
}

export async function listRefs(options: {
  repoPath: string;
  kind: RefKind;
  signal?: AbortSignal;
}): Promise<RefList> {
  const { repoPath, kind, signal } = options;

  const { code, stdout } = await captureGit({
    args: [
      "for-each-ref",
      `--count=${maxRefs + 1}`,
      "--sort=-creatordate",
      "--format=%(refname:short)%00%(contents:subject)%00%(creatordate:unix)%00%(objecttype)",
      "--end-of-options",
      namespaces[kind],
    ],
    cwd: repoPath,
    signal,
    limit: (maxRefs + 1) * bytesPerRef,
    timeoutMs: refTimeoutMs,
  });

  if (code !== 0) throw new Error(`git for-each-ref exited ${code}`);

  const listed = parse(stdout.toString("utf8"));

  return {
    kind,
    refs: listed.slice(0, maxRefs),
    more: listed.length > maxRefs,
  };
}

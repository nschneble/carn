// SPDX-License-Identifier: AGPL-3.0-or-later

import { refListPage } from "../../src/html/ref-list.js";
import { maxSubjectChars } from "../../src/repos/log.js";
import type { Ref, RefKind, RefList } from "../../src/repos/refs.js";
import { frozenNow } from "../support/fixture-repos.js";

export const refsNow = new Date(frozenNow);
export const defaultBranch = "main";

const hour = 3_600_000;

const branchRows: [string, string][] = [
  ["main", "Keep the tarball byte-reproducible"],
  [
    "14-conflict-output",
    "Parse the conflict section rather than the exit code",
  ],
  ["feature/ref-tables", "Render the branch list as a table"],
  ["release/1.2", "Cut the reader down to one query"],
  ["spike/highlight", "Measure the highlighted blob against the budget"],
  ["fix/env-request-key", "Read val, not value, off the env request"],
  ["docs/brand-layout", "Say what a failed fetch did, then what to do"],
  ["chore/prune-baselines", "Drop the second index; one covers both reads"],
];

const tagRows: [string, string][] = [
  ["v1.2.0", "Serve the archive page without a client bundle"],
  ["v1.1.1", "Escape the title before it reaches the page"],
  ["v1.1.0", "Move the digest out of the request path"],
  ["v1.0.0", "Answer a HEAD the way a GET does"],
  ["mlp", "Pin the reading list to one table"],
];

function rows(source: [string, string][]): Ref[] {
  return source.map(([name, subject], index) => ({
    name,
    subject,
    at: new Date(refsNow.getTime() - (index + 1) * 9 * hour),
  }));
}

export const branches = rows(branchRows);
export const tags = rows(tagRows);

// git takes --allow-empty-message, so the subject cell has a bare state
export const quietBranch: Ref = {
  name: "spike/no-message",
  subject: "",
  at: new Date(refsNow.getTime() - 4 * hour),
};

export function wideRefs(count: number): Ref[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `${branchRows[index % branchRows.length]?.[0] as string}-${index}`,
    subject: `${tagRows[index % tagRows.length]?.[1] as string} ${index}`,
    at: new Date(refsNow.getTime() - (index + 1) * hour),
  }));
}

const alphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

// deterministic, and dense enough that gzip cannot collapse it: a weight
// budget measured on repeated runs is measured on nothing
export function noisyRefs(count: number): Ref[] {
  let seed = 0x9e37_79b9;

  const next = (): number => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;

    return (seed >>> 0) % alphabet.length;
  };

  const noise = (length: number): string =>
    Array.from({ length }, () => alphabet[next()] as string).join("");

  return Array.from({ length: count }, (_, index) => ({
    name: noise(120),
    subject: noise(maxSubjectChars),
    at: new Date(refsNow.getTime() - (index + 1) * hour),
  }));
}

export function refList(
  kind: RefKind,
  options: Partial<Omit<RefList, "kind">> = {},
): RefList {
  return {
    kind,
    refs: kind === "branch" ? branches : tags,
    more: false,
    ...options,
  };
}

export function refsDocument(
  options: { repo?: string; list?: RefList; kind?: RefKind } = {},
): string {
  return refListPage({
    repo: options.repo ?? "linklater",
    list: options.list ?? refList(options.kind ?? "branch"),
    defaultBranch,
    now: refsNow,
  });
}

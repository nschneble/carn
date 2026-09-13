// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash } from "node:crypto";

import {
  type CommitPage,
  commitFilePage,
  commitPage,
} from "../../src/html/commit-page.js";
import type { CommitDetail, DiffFile } from "../../src/repos/commit.js";
import { logNow } from "./commit-log.js";

function patch(path: string, added: number, deleted: number): string {
  const kept = ["const rows = [];", "const limit = 25;", "export { rows };"];
  const lines = [
    `diff --git a/${path} b/${path}`,
    "index 1a2b3c4..5d6e7f8 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${deleted + kept.length} +1,${added + kept.length} @@`,
    ...kept.map((line) => ` ${line}`),
    ...Array.from({ length: deleted }, (_, at) => `-const stale${at} = ${at};`),
    ...Array.from({ length: added }, (_, at) => `+const fresh${at} = ${at};`),
  ];

  return `${lines.join("\n")}\n`;
}

export function textFile(
  path: string,
  added: number,
  deleted: number,
): DiffFile {
  return {
    path,
    from: null,
    added,
    deleted,
    patch: patch(path, added, deleted),
  };
}

export const binaryFile: DiffFile = {
  path: "assets/logo.png",
  from: null,
  added: null,
  deleted: null,
  patch: `diff --git a/assets/logo.png b/assets/logo.png
index 0000000..3597799 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`,
};

export const renamedFile: DiffFile = {
  path: "src/store.ts",
  from: "src/rows.ts",
  added: 0,
  deleted: 0,
  patch: `diff --git a/src/rows.ts b/src/store.ts
similarity index 100%
rename from src/rows.ts
rename to src/store.ts
`,
};

const paths = [
  "src/index.ts",
  "src/store.ts",
  "src/reader.ts",
  "src/fetch.ts",
  "src/digest.ts",
  "src/routes/list.ts",
  "src/routes/show.ts",
  "docs/BRAND.md",
];

// bytes gzip cannot shrink, from a seed rather than a source of entropy:
// a repetitive fixture compresses away and never reaches the cutoff
function noisyPatch(path: string, lines: number): string {
  let block = createHash("sha256").update(path).digest();
  const body: string[] = [];

  for (let at = 0; at < lines; at += 1) {
    block = createHash("sha256").update(block).digest();
    body.push(`${at % 3 === 0 ? "-" : "+"}${block.toString("base64")}`);
  }

  return `diff --git a/${path} b/${path}
index 1a2b3c4..5d6e7f8 100644
--- a/${path}
+++ b/${path}
@@ -1,${lines} +1,${lines} @@
${body.join("\n")}
`;
}

export function noisyFiles(count: number, lines = 40): DiffFile[] {
  return Array.from({ length: count }, (_, index) => {
    const path = `src/generated/rows-${index}.ts`;

    return {
      path,
      from: null,
      added: lines - Math.ceil(lines / 3),
      deleted: Math.ceil(lines / 3),
      patch: noisyPatch(path, lines),
    };
  });
}

export function files(count: number): DiffFile[] {
  return Array.from({ length: count }, (_, index) =>
    textFile(
      `${paths[index % paths.length]}${index < paths.length ? "" : `.${index}`}`,
      6 + (index % 5),
      2 + (index % 3),
    ),
  );
}

export function detail(options: Partial<CommitDetail> = {}): CommitDetail {
  return {
    sha: "9f1c4a20b7e35d8146af0c92b3e7d5081ca4f6b2",
    parents: ["3c7e9a15d4b80f26ae5138c07b9d24ef6a08135c"],
    author: "Nick Schneble",
    at: new Date(logNow.getTime() - 3 * 3_600_000),
    signature: "N",
    subject: "Read the list back",
    body: "The reader was walking the table twice: once to count and once to\npage. One query answers both.",
    files: [textFile("src/reader.ts", 12, 4)],
    ...options,
  };
}

export function view(options: Partial<CommitPage> = {}): CommitPage {
  return {
    repo: "linklater",
    commit: detail(),
    now: logNow,
    ...options,
  };
}

export function commitDocument(options: Partial<CommitPage> = {}): string {
  return commitPage(view(options));
}

export function changeDocument(
  path: string,
  options: Partial<CommitPage> = {},
): string {
  const rendered = commitFilePage(view(options), path);
  if (rendered === null) throw new Error(`no ${path} in the fixture commit`);

  return rendered;
}

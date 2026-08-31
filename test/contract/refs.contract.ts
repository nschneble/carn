// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { commitsHref } from "../../src/html/commit-log.js";
import { refsHref } from "../../src/html/ref-list.js";
import { budgetBytes, pageWireBytes } from "../../src/html/wire-weight.js";
import { maxSubjectChars } from "../../src/repos/log.js";
import { listRefs, maxRefs, type RefList } from "../../src/repos/refs.js";
import {
  branches,
  noisyRefs,
  refList,
  refsDocument,
  wideRefs,
} from "../gallery/refs.js";

const dir = mkdtempSync(join(tmpdir(), "carn-refs-"));
const shim = join(dir, "shim");
const calls = join(shim, "calls");
const realGit = execFileSync("sh", ["-c", "command -v git"], {
  encoding: "utf8",
}).trim();

const branchNames = [
  "14-conflict-output",
  "feature/ref-tables",
  "release/1.2",
  "spike/highlight",
  "fix/env-request-key",
  "docs/brand-layout",
];

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function git(repoPath: string, args: string[], at?: string): void {
  const stamp =
    at === undefined ? {} : { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at };

  execFileSync(
    "git",
    ["-C", repoPath, "-c", "user.email=t@t", "-c", "user.name=t", ...args],
    {
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", ...stamp },
    },
  );
}

// six branches and three tags, one of the tags annotated: an annotated tag
// names a tag object, whose committerdate is empty, so a format reading
// that field renders every annotated tag at the epoch
function build(): string {
  const path = mkdtempSync(join(dir, "repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", path]);

  writeFileSync(join(path, "rows.txt"), "0\n");
  git(path, ["add", "-A"]);
  git(path, ["commit", "-qm", "main change 0"], "2026-01-01T00:00:00Z");
  git(path, ["tag", "light-tag"]);
  git(
    path,
    ["tag", "-a", "v1.0.0", "-m", "Release 1.0.0"],
    "2026-01-05T00:00:00Z",
  );

  for (const [index, name] of branchNames.entries()) {
    git(path, ["checkout", "-q", "-b", name, "main"]);
    writeFileSync(join(path, "rows.txt"), `${index + 1}\n`);
    git(path, ["add", "-A"]);
    git(
      path,
      ["commit", "-qm", `${name} change`],
      `2026-01-0${index + 2}T00:00:00Z`,
    );
  }

  git(path, ["checkout", "-q", "main"]);
  git(
    path,
    ["tag", "-a", "v1.1.0", "-m", "Release 1.1.0"],
    "2026-01-20T00:00:00Z",
  );

  return path;
}

const repoPath = build();

mkdirSync(shim, { recursive: true });
writeFileSync(
  join(shim, "git"),
  `#!/bin/sh\nprintf '%s\\n' "$*" >> ${calls}\nexec ${realGit} "$@"\n`,
);
chmodSync(join(shim, "git"), 0o755);

// the shim is only on PATH inside this helper, so the fixture build above
// never lands in the recording
async function record<T>(run: () => Promise<T>): Promise<[T, string[]]> {
  const originalPath = process.env.PATH;
  writeFileSync(calls, "");
  process.env.PATH = `${shim}:${originalPath ?? ""}`;

  try {
    const result = await run();
    const argv = readFileSync(calls, "utf8").split("\n").filter(Boolean);

    return [result, argv];
  } finally {
    process.env.PATH = originalPath;
  }
}

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="(\/r\/linklater\/commits\?[^"]*)"/g)].map(
    (found) => found[1] as string,
  );
}

test("a branch list is one for-each-ref, not one call per branch", async () => {
  const [list, argv] = await record(() =>
    listRefs({ repoPath, kind: "branch" }),
  );

  assert.strictEqual(
    argv.length,
    1,
    `listing ${list.refs.length} branches ran ${argv.length} git calls:\n${argv.join("\n")}`,
  );

  const invocation = argv[0] as string;

  assert.ok(invocation.startsWith("for-each-ref "), invocation);
  assert.ok(invocation.includes(" refs/heads/"), invocation);
  assert.ok(
    !invocation.includes("rev-parse") && !invocation.includes("log "),
    `the branch list reached for a second plumbing command: ${invocation}`,
  );
  assert.strictEqual(list.refs.length, branchNames.length + 1);
});

test("a tag list is one for-each-ref too, over the tag namespace", async () => {
  const [list, argv] = await record(() => listRefs({ repoPath, kind: "tag" }));

  assert.strictEqual(argv.length, 1, argv.join("\n"));
  assert.ok((argv[0] as string).includes(" refs/tags/"), argv[0]);
  assert.deepStrictEqual(list.refs.map((ref) => ref.name).sort(), [
    "light-tag",
    "v1.0.0",
    "v1.1.0",
  ]);
});

// creatordate and contents:subject are the fields defined for a tag object
// and a commit alike; committerdate and %(*...) are not
test("an annotated tag carries its own subject and a real date", async () => {
  const list = await listRefs({ repoPath, kind: "tag" });
  const byName = new Map(list.refs.map((ref) => [ref.name, ref]));

  const annotated = byName.get("v1.1.0");
  assert.ok(annotated);
  assert.strictEqual(annotated.subject, "Release 1.1.0");
  assert.strictEqual(annotated.at.toISOString(), "2026-01-20T00:00:00.000Z");

  const lightweight = byName.get("light-tag");
  assert.ok(lightweight);
  assert.strictEqual(lightweight.subject, "main change 0");
  assert.strictEqual(lightweight.at.toISOString(), "2026-01-01T00:00:00.000Z");

  assert.deepStrictEqual(
    list.refs.map((ref) => ref.name),
    ["v1.1.0", "v1.0.0", "light-tag"],
    "the list is not in newest-first order, so --sort names a field one of the two tag shapes leaves empty",
  );
});

test("branches come back newest first, with the tip subject on each", async () => {
  const list = await listRefs({ repoPath, kind: "branch" });

  assert.deepStrictEqual(
    list.refs.map((ref) => ref.name),
    [...[...branchNames].reverse(), "main"],
  );
  assert.strictEqual(list.refs.at(-1)?.subject, "main change 0");
  assert.strictEqual(list.more, false);
});

test("one page render costs one spawn", async () => {
  const [, argv] = await record(async () => {
    const list = await listRefs({ repoPath, kind: "branch" });

    return refsDocument({ list });
  });

  assert.strictEqual(
    argv.length,
    1,
    `a branch page render spawned git ${argv.length} times:\n${argv.join("\n")}`,
  );
  assert.ok(argv.length < 12, "the render broke CLAUDE.md's spawn budget");
});

test("both lists are tables with a head and a scope on every column", () => {
  for (const kind of ["branch", "tag"] as const) {
    const markup = refsDocument({ kind });
    const heads = [...markup.matchAll(/<th class="t-label" scope="col">/g)];

    assert.strictEqual(markup.split('<table class="refs">').length, 2, kind);
    assert.ok(markup.includes("<thead>"), kind);
    assert.ok(markup.includes("<tbody>"), kind);
    assert.strictEqual(
      heads.length,
      3,
      `${kind} rendered ${heads.length} <th>`,
    );

    const labels = [...markup.matchAll(/<th [^>]*>([^<]+)<\/th>/g)].map(
      (found) => found[1] as string,
    );

    assert.deepStrictEqual(labels, [
      kind === "branch" ? "Branch" : "Tag",
      "Subject",
      "Age",
    ]);
    assert.strictEqual(
      new Set(labels).size,
      labels.length,
      "two columns share an accessible name",
    );
    assert.doesNotMatch(markup, /<ul class="refs"|<li class="row"/, kind);
  }
});

test("every row is three links to the log scoped to that ref", () => {
  const markup = refsDocument();
  const links = hrefs(markup);

  assert.strictEqual(
    links.length,
    branches.length * 3,
    `${branches.length} rows rendered ${links.length} links, not the three per row BRAND.md specifies`,
  );

  for (const ref of branches) {
    const href = commitsHref("linklater", ref.name).replace("&", "&amp;");

    assert.strictEqual(
      links.filter((link) => link === href).length,
      3,
      `${ref.name} does not carry three links to its own scoped log`,
    );
  }

  assert.ok(
    hrefs(refsDocument({ kind: "tag" })).every((link) =>
      link.startsWith("/r/linklater/commits?ref="),
    ),
    "a tag row links somewhere other than the scoped log",
  );
});

// the overlay retires with the <ul>: a whole-row anchor would swallow two
// of the three links, and position: relative on a <tr> is patchy in WebKit
test("no row carries an overlay anchor", () => {
  const markup = refsDocument();

  assert.doesNotMatch(markup, /class="nm[^"]*" href/);
  assert.ok(
    markup.includes('<td class="nm"><a class="t-item" href='),
    "the name cell stopped being its own link",
  );
  assert.doesNotMatch(markup, /<tr[^>]+href|<tr class=/);
});

test("the branch table names the default branch, and the tag table does not", () => {
  const marked = refsDocument();
  const tagged = refsDocument({ kind: "tag" });

  assert.ok(
    marked.includes('main <span class="t-micro">Default</span></a>'),
    "the default branch is not named in the branch table",
  );
  assert.strictEqual(
    [...marked.matchAll(/>Default</g)].length,
    1,
    "more than one branch claims to be the default",
  );
  assert.doesNotMatch(tagged, />Default</);
});

test("an empty list says what would be here and how to make one", () => {
  const cases: [string, string][] = [
    ["branch", "No branches yet."],
    ["tag", "No tags yet."],
  ];

  for (const [kind, opening] of cases) {
    const markup = refsDocument({
      list: refList(kind as RefList["kind"], { refs: [] }),
    });

    assert.match(markup, /<div class="empty">/);
    assert.ok(markup.includes(opening), kind);
    assert.ok(markup.includes("git push "), kind);
    assert.doesNotMatch(markup, /<table class="refs">/, kind);

    const empties = [
      ...markup.matchAll(/<div class="empty">([\s\S]*?)<\/div>/g),
    ]
      .map((found) => found[1] as string)
      .join("\n");

    assert.doesNotMatch(empties, /Oops|sorry|[!…]/i, kind);
  }
});

test("a list longer than the read cap says it is showing the first of them", () => {
  const whole = refsDocument({
    list: refList("branch", { refs: wideRefs(maxRefs) }),
  });
  const cut = refsDocument({
    list: refList("branch", { refs: wideRefs(maxRefs), more: true }),
  });

  assert.doesNotMatch(whole, /Showing the first/);
  assert.ok(cut.includes(`Showing the first ${maxRefs} branches.`));
  assert.ok(
    refsDocument({
      list: refList("tag", { refs: wideRefs(maxRefs), more: true }),
    }).includes(`Showing the first ${maxRefs} tags.`),
  );
});

test("every state fits the budget as gzip-5 wire bytes", () => {
  const states: [string, string][] = [
    ["branches", refsDocument()],
    ["tags", refsDocument({ kind: "tag" })],
    ["empty", refsDocument({ list: refList("branch", { refs: [] }) })],
    [
      "full",
      refsDocument({
        list: refList("branch", { refs: wideRefs(maxRefs), more: true }),
      }),
    ],
    [
      "incompressible",
      refsDocument({ list: refList("branch", { refs: noisyRefs(maxRefs) }) }),
    ],
  ];

  for (const [state, markup] of states) {
    const weight = pageWireBytes(markup);

    assert.ok(
      weight <= budgetBytes,
      `the ${state} ref list weighs ${weight} wire bytes against a ${budgetBytes} B budget`,
    );
  }
});

// the read cap is a bound on the read, not on the weight: a page of
// incompressible subjects is heavier per row than a page of real ones, so
// the fit has to measure. without the shed this fixture is 200 KB
test("a page that cannot fit sheds rows and says how many are left", () => {
  const refs = noisyRefs(maxRefs);
  const markup = refsDocument({ list: refList("branch", { refs }) });
  const shown = [...markup.matchAll(/<td class="nm">/g)].length;

  assert.ok(
    shown < refs.length,
    `${refs.length} incompressible rows rendered whole, so the budget was never measured`,
  );
  assert.ok(shown > 0, "the fit shed every row");
  assert.ok(
    markup.includes(`Showing the first ${shown} branches.`),
    `the page shed rows down to ${shown} without saying so`,
  );

  const whole = refsDocument({
    list: refList("branch", { refs: wideRefs(20) }),
  });

  assert.doesNotMatch(
    whole,
    /Showing the first/,
    "a list that fits claims to be truncated, so the pair proves no contrast",
  );
  assert.strictEqual([...whole.matchAll(/<td class="nm">/g)].length, 20);
});

// the shed's last stop is one row, and the loop returns that row without
// measuring it. git bounds a refname at 255 bytes and the loader bounds a
// subject, so the pair has a widest case: pin that it fits
test("the widest single row the loader can produce fits on its own", () => {
  const [wide] = noisyRefs(3);
  const noise = noisyRefs(3)
    .map((ref) => ref.name)
    .join("");
  assert.ok(wide);

  const widest = {
    ...wide,
    name: noise.slice(0, 255),
    subject: wide.subject.slice(0, maxSubjectChars),
  };

  assert.strictEqual(widest.name.length, 255);
  assert.strictEqual(widest.subject.length, maxSubjectChars);

  const markup = refsDocument({
    list: refList("branch", { refs: [widest], more: true }),
  });
  const weight = pageWireBytes(markup);

  assert.ok(
    weight <= budgetBytes,
    `one widest-case row weighs ${weight} wire bytes against a ${budgetBytes} B budget, so the shed has no floor that fits`,
  );
  assert.strictEqual([...markup.matchAll(/<td class="nm">/g)].length, 1);
});

test("a subject longer than a subject is bounded before it renders", async () => {
  const shouting = mkdtempSync(join(dir, "shout-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", shouting]);
  writeFileSync(join(shouting, "a"), "a\n");
  git(shouting, ["add", "-A"]);
  git(shouting, ["commit", "-qm", "z".repeat(maxSubjectChars * 4)]);

  const list = await listRefs({ repoPath: shouting, kind: "branch" });

  assert.strictEqual(list.refs[0]?.subject.length, maxSubjectChars);
});

// git takes --allow-empty-message, and every other cell would still render
test("a commit with no message leaves the cell bare, not a nameless link", async () => {
  const quiet = mkdtempSync(join(dir, "quiet-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", quiet]);
  execFileSync(
    "git",
    [
      "-C",
      quiet,
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "--allow-empty",
      "--allow-empty-message",
      "-m",
      "",
    ],
    { env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } },
  );

  const list = await listRefs({ repoPath: quiet, kind: "branch" });
  assert.strictEqual(list.refs[0]?.subject, "");

  const markup = refsDocument({ list });

  assert.ok(
    markup.includes('<td class="msg"></td>'),
    "an empty subject rendered as an anchor, which axe reads as a link with no accessible name",
  );
  assert.doesNotMatch(markup, /<a[^>]*><\/a>/);
  assert.strictEqual([...markup.matchAll(/<td class="nm">/g)].length, 1);
});

// a tag can name a blob or a tree; creatordate is empty on both, and
// Number("") is 0, so an unguarded row dates itself to 1970
test("a tag naming no commit is left out rather than dated at the epoch", async () => {
  const odd = mkdtempSync(join(dir, "odd-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", odd]);
  writeFileSync(join(odd, "f"), "hello\n");
  git(odd, ["add", "-A"]);
  git(odd, ["commit", "-qm", "c"], "2026-01-01T00:00:00Z");

  const blob = execFileSync("git", ["-C", odd, "rev-parse", "HEAD:f"], {
    encoding: "utf8",
  }).trim();

  git(odd, ["tag", "blob-tag", blob]);
  git(odd, ["tag", "real-tag"]);

  const list = await listRefs({ repoPath: odd, kind: "tag" });

  assert.deepStrictEqual(
    list.refs.map((ref) => ref.name),
    ["real-tag"],
    "a ref naming no commit reached the page, where it has no log to link to and no date to show",
  );
});

test("a repo with no tags gets an empty list, not a failure", async () => {
  const bare = mkdtempSync(join(dir, "bare-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", bare]);

  for (const kind of ["branch", "tag"] as const) {
    const list = await listRefs({ repoPath: bare, kind });

    assert.deepStrictEqual(list.refs, [], kind);
    assert.strictEqual(list.more, false, kind);
  }
});

test("the two routes are the two nouns, and the page says which it is", () => {
  assert.strictEqual(refsHref("linklater", "branch"), "/r/linklater/branches");
  assert.strictEqual(refsHref("linklater", "tag"), "/r/linklater/tags");

  const markup = refsDocument({ kind: "tag" });

  assert.ok(markup.includes('<h1 class="t-label">Tags</h1>'));
  assert.ok(markup.includes("<title>Tags · linklater · Càrn"));
  assert.ok(
    markup.includes(
      'content="https://carn.fancyenchiladas.net/r/linklater/tags"',
    ),
    "og:url does not name the page it is on",
  );
  assert.strictEqual([...markup.matchAll(/<h1[ >]/g)].length, 1);
});

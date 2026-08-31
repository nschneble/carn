// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

import {
  commitLogPage,
  commitsHref,
  shortShaChars,
} from "../../src/html/commit-log.js";
import { noSuchRef } from "../../src/html/error-page.js";
import { budgetBytes, pageWireBytes } from "../../src/html/wire-weight.js";
import {
  type CommitLog,
  loadCommitLog,
  logRowCap,
  maxSubjectChars,
} from "../../src/repos/log.js";
import { commits, log, logDocument, logNow } from "../gallery/commit-log.js";

const dir = mkdtempSync(join(tmpdir(), "carn-commit-log-"));
const shim = join(dir, "shim");
const calls = join(shim, "calls");
const realGit = execFileSync("sh", ["-c", "command -v git"], {
  encoding: "utf8",
}).trim();

const depth = 40;
const sideCommits = 3;

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

// linear main deep enough for three pages, plus a branch whose subjects
// share no text with main's, so ?ref= scoping cannot pass by coincidence
function build(): string {
  const path = mkdtempSync(join(dir, "repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", path]);

  for (let index = 0; index < depth; index += 1) {
    writeFileSync(join(path, "rows.txt"), `${index}\n`);
    git(path, ["add", "-A"]);
    git(
      path,
      ["commit", "-qm", `main change ${index}`],
      `2026-01-01T00:${String(index).padStart(2, "0")}:00Z`,
    );
  }

  git(path, ["checkout", "-q", "-b", "side"]);

  for (let index = 0; index < sideCommits; index += 1) {
    writeFileSync(join(path, "side.txt"), `${index}\n`);
    git(path, ["add", "-A"]);
    git(
      path,
      ["commit", "-qm", `side change ${index}`],
      `2026-02-01T00:0${index}:00Z`,
    );
  }

  git(path, ["checkout", "-q", "main"]);

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

async function walk(ref = "main"): Promise<CommitLog[]> {
  const pages: CommitLog[] = [];
  let from: string | null = null;

  do {
    const page = await loadCommitLog({ repoPath, ref, from });
    assert.ok(page, `page ${pages.length + 1} of ${ref} did not resolve`);

    pages.push(page);
    from = page.next;
  } while (from !== null && pages.length < 10);

  return pages;
}

function shasIn(markup: string): string[] {
  return [...markup.matchAll(/href="\/r\/[^/]+\/commits\/([0-9a-f]+)"/g)].map(
    (found) => found[1] as string,
  );
}

test("page two starts from the cursor rather than skipping to it", async () => {
  const [first] = await record(() => loadCommitLog({ repoPath, ref: "main" }));
  assert.ok(first?.next, "a 40-commit history reported no second page");

  const [second, argv] = await record(() =>
    loadCommitLog({ repoPath, ref: "main", from: first.next }),
  );

  assert.strictEqual(argv.length, 1, `page two ran ${argv.length} git calls`);
  const invocation = argv[0] as string;

  assert.ok(
    !invocation.includes("--skip"),
    `page two paginated by offset: ${invocation}`,
  );
  assert.ok(
    invocation.includes(first.next),
    `page two did not name the cursor, so it re-walked from the tip: ${invocation}`,
  );
  assert.ok(
    !invocation.includes(" main"),
    `page two named the ref as well as the cursor, so the walk still starts at the tip: ${invocation}`,
  );
  assert.ok(
    invocation.includes(`--max-count=${logRowCap + 1}`),
    `page two asked for a different window: ${invocation}`,
  );

  assert.ok(second);
  assert.strictEqual(
    second.commits[0]?.sha,
    first.next,
    "the cursor commit is not page two's first row, so a row was dropped or repeated at the seam",
  );
});

test("no commit is shown twice across the pages of one walk", async () => {
  const pages = await walk();
  const shown = pages.flatMap((page) =>
    page.commits.map((commit) => commit.sha),
  );

  assert.strictEqual(
    shown.length,
    depth,
    `the walk showed ${shown.length} of ${depth} commits`,
  );
  assert.strictEqual(
    new Set(shown).size,
    shown.length,
    "a commit appeared on two pages, so the cursor re-read part of the page before it",
  );

  const first = pages[0] as CommitLog;
  const second = pages[1] as CommitLog;
  const overlap = first.commits
    .map((commit) => commit.sha)
    .filter((sha) => second.commits.some((commit) => commit.sha === sha));

  assert.deepStrictEqual(overlap, [], "page two re-read part of page one");
});

test("the rendered pages repeat no sha either", async () => {
  const pages = await walk();
  const rendered = pages.flatMap((page, index) =>
    shasIn(
      commitLogPage({
        repo: "linklater",
        log: page,
        now: logNow,
        from: index === 0 ? null : (pages[index - 1] as CommitLog).next,
      }),
    ),
  );

  // three links per row all point at the same commit, so the rendered
  // count is a multiple of the rows rather than equal to them
  const unique = new Set(rendered);

  assert.strictEqual(
    unique.size,
    depth,
    `the rendered pages named ${unique.size} distinct commits, not ${depth}`,
  );
  assert.strictEqual(
    rendered.length,
    depth * 3,
    "a row rendered a different number of commit links than the three BRAND.md specifies",
  );
});

test("the last page says so, and the pages before it do not", async () => {
  const pages = await walk();

  assert.strictEqual(pages.length, Math.ceil(depth / logRowCap));

  for (const page of pages.slice(0, -1)) {
    assert.strictEqual(page.commits.length, logRowCap);
    assert.notStrictEqual(page.next, null, "a full page offered no next page");
  }

  const last = pages.at(-1) as CommitLog;

  assert.strictEqual(last.next, null, "the last page offered a next page");
  assert.ok(last.commits.length < logRowCap);

  const tail = commitLogPage({ repo: "linklater", log: last, now: logNow });
  assert.doesNotMatch(tail, /class="showall"/, "the last page linked onward");

  const head = commitLogPage({
    repo: "linklater",
    log: pages[0] as CommitLog,
    now: logNow,
  });
  assert.ok(
    head.includes(
      `href="${commitsHref("linklater", "main", (pages[0] as CommitLog).next).replace("&", "&amp;")}"`,
    ),
    "the first page's older link lost its cursor or its ref",
  );
});

test("a page boundary falling exactly on the last commit ends the walk", async () => {
  const page = await loadCommitLog({ repoPath, ref: "main", cap: depth });

  assert.strictEqual(page?.commits.length, depth);
  assert.strictEqual(
    page.next,
    null,
    "a page holding the whole history still offered another",
  );
});

test("a ref scopes the log to that ref's own history", async () => {
  const [side, argv] = await record(() =>
    loadCommitLog({ repoPath, ref: "side" }),
  );

  assert.strictEqual(argv.length, 1, "one page cost more than one git call");
  assert.ok(side);

  const subjects = side.commits.map((commit) => commit.subject);

  assert.strictEqual(
    subjects.filter((s) => s.startsWith("side ")).length,
    sideCommits,
  );
  assert.strictEqual(side.ref, "side");
  assert.ok(
    subjects[0]?.startsWith("side "),
    `the side branch's log opened on ${subjects[0]}`,
  );

  const main = await loadCommitLog({ repoPath, ref: "main" });
  assert.ok(main);
  assert.ok(
    main.commits.every((commit) => !commit.subject.startsWith("side ")),
    "main's log carried the side branch's commits",
  );
});

test("a ref or cursor git cannot resolve is refused, never defaulted", async () => {
  const cases: { ref: string; from?: string }[] = [
    { ref: "no-such-branch" },
    { ref: "-oops" },
    { ref: "../etc/passwd" },
    { ref: "main..side" },
    { ref: "main", from: "not-a-sha" },
    { ref: "main", from: "-oops" },
    { ref: "main", from: "0".repeat(40) },
  ];

  for (const { ref, from } of cases) {
    assert.strictEqual(
      await loadCommitLog({ repoPath, ref, from: from ?? null }),
      null,
      `${ref}${from === undefined ? "" : ` from ${from}`} resolved to a log`,
    );
  }
});

test("a repo with no commits gets an empty state, not an error", async () => {
  const bare = mkdtempSync(join(dir, "bare-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", bare]);

  assert.strictEqual(
    await loadCommitLog({ repoPath: bare, ref: "main" }),
    null,
    "an unborn branch resolved to a log, so the route never reaches its empty state",
  );

  const markup = logDocument({
    log: { ref: "main", commits: [], next: null },
  });

  assert.match(markup, /<div class="empty">/);
  assert.ok(markup.includes("No commits yet."));
  assert.ok(markup.includes("git push "));
  assert.doesNotMatch(markup, /<ul class="log"/);
  assert.doesNotMatch(markup, /class="showall"/);

  const empties = [...markup.matchAll(/<div class="empty">([\s\S]*?)<\/div>/g)]
    .map((found) => found[1] as string)
    .join("\n");

  assert.doesNotMatch(empties, /Oops|sorry|[!…]/i);
});

test("one render costs one spawn", async () => {
  const [, argv] = await record(async () => {
    const page = await loadCommitLog({ repoPath, ref: "main" });
    assert.ok(page);

    return commitLogPage({ repo: "linklater", log: page, now: logNow });
  });

  assert.strictEqual(
    argv.length,
    1,
    `a commit log render spawned git ${argv.length} times:\n${argv.join("\n")}`,
  );
  assert.ok(argv.length < 12, "the render broke CLAUDE.md's spawn budget");
});

test("a row carries three links to the commit and no row overlay", () => {
  const markup = logDocument();
  const [first] = log().commits;
  assert.ok(first);

  const href = `/r/linklater/commits/${first.sha}`;

  assert.ok(
    markup.includes(
      `<a class="nm t-mono" href="${href}">${first.sha.slice(0, shortShaChars)}</a>`,
    ),
    "the sha cell is not a mono link to the commit",
  );
  assert.ok(
    markup.includes(`<a class="msg" href="${href}">${first.subject}</a>`),
    "the subject is not a link to the commit",
  );
  assert.ok(
    markup.includes(
      `<a class="age" href="${href}"><span class="vh">Committed </span><time datetime="${first.at.toISOString()}">`,
    ),
    "the age is not a link to the commit, or lost its label",
  );
  assert.doesNotMatch(markup, /<table|<thead|scope="col"/);
  assert.strictEqual([...markup.matchAll(/<h1[ >]/g)].length, 1);
});

test("the sixteen-row cap is the page size the walk uses", async () => {
  assert.strictEqual(logRowCap, 16);

  const page = await loadCommitLog({ repoPath, ref: "main" });
  assert.strictEqual(page?.commits.length, logRowCap);

  const rows = [...logDocument({ log: page }).matchAll(/<li class="row">/g)]
    .length;
  assert.strictEqual(rows, logRowCap);
});

test("a subject longer than a subject is bounded before it renders", async () => {
  const shouting = mkdtempSync(join(dir, "shout-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", shouting]);
  writeFileSync(join(shouting, "a"), "a\n");
  git(shouting, ["add", "-A"]);
  git(shouting, ["commit", "-qm", "z".repeat(maxSubjectChars * 4)]);

  const page = await loadCommitLog({ repoPath: shouting, ref: "main" });

  assert.strictEqual(page?.commits[0]?.subject.length, maxSubjectChars);

  const ordinary = await loadCommitLog({ repoPath, ref: "main" });
  assert.strictEqual(ordinary?.commits[0]?.subject, "main change 39");
});

// a repeated character folds into the row above it, so a page of them
// measures far less pressure than a page of real subjects does
function denseSubject(seed: number, chars: number): string {
  let text = "";
  let block = createHash("sha256").update(`carn-${seed}`).digest();

  while (text.length < chars) {
    text += block.toString("base64url");
    block = createHash("sha256").update(block).digest();
  }

  return text.slice(0, chars);
}

test("every commit log page fits the budget as gzip-5 wire bytes", () => {
  const pages: [string, string][] = [
    ["full", logDocument()],
    ["last", logDocument({ log: log({ commits: commits(9), next: null }) })],
    ["empty", logDocument({ log: log({ commits: [], next: null }) })],
    [
      "long subjects",
      logDocument({
        log: log({
          commits: commits(16).map((commit, index) => ({
            ...commit,
            subject: denseSubject(index, maxSubjectChars),
          })),
        }),
      }),
    ],
  ];

  for (const [state, markup] of pages) {
    const weight = pageWireBytes(markup);

    assert.ok(
      weight <= budgetBytes,
      `the ${state} commit log weighs ${weight} wire bytes against a ${budgetBytes} B budget`,
    );
  }
});

test("the older link is a real url with an escaped separator", () => {
  const markup = logDocument({ log: log({ ref: "release/1.2" }) });

  assert.ok(
    markup.includes('href="/r/linklater/commits?ref=release%2F1.2&amp;from='),
    "the older link left its ref unencoded or its separator unescaped",
  );
  assert.doesNotMatch(markup, /<details|<summary|aria-expanded|onclick/);
  assert.ok(markup.includes('Older<span aria-hidden="true"> →</span>'));
});

test("the ref reaches the heading, the title, and the canonical", () => {
  const markup = logDocument({ log: log({ ref: "14-conflict-output" }) });

  assert.ok(
    markup.includes('<h1 class="t-label">Commits on 14-conflict-output</h1>'),
  );
  assert.ok(
    markup.includes("<title>Commits on 14-conflict-output · linklater · Càrn"),
  );
  assert.ok(
    markup.includes(
      'content="https://carn.fancyenchiladas.net/r/linklater/commits?ref=14-conflict-output"',
    ),
    "og:url does not name the page it is on",
  );

  const second = logDocument({
    log: log({ ref: "main" }),
    from: "b".repeat(40),
  });
  assert.ok(
    second.includes(
      `/r/linklater/commits?ref=main&amp;from=${"b".repeat(40)}"`,
    ),
    "page two's canonical claims to be page one",
  );
});

test("a refused ref says what happened, then what to do", () => {
  const failure = noSuchRef("release/9.9");

  assert.strictEqual(failure.path, "/404");
  assert.ok(failure.said.startsWith("There's no branch, tag, or commit named"));
  assert.doesNotMatch(`${failure.said} ${failure.next}`, /Oops|sorry|[!…]/i);
});

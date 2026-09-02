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

import { changeHref, commitFilePage } from "../../src/html/commit-page.js";
import { noSuchChange, noSuchCommit } from "../../src/html/error-page.js";
import {
  budgetBytes,
  pageWireBytes,
  stylesheetWireBytes,
} from "../../src/html/wire-weight.js";
import { type CommitDetail, loadCommit } from "../../src/repos/commit.js";
import {
  binaryFile,
  changeDocument,
  commitDocument,
  detail,
  files,
  noisyFiles,
  renamedFile,
  textFile,
  view,
} from "../gallery/commit.js";
import { logNow } from "../gallery/commit-log.js";

const dir = mkdtempSync(join(tmpdir(), "carn-commit-"));
const shim = join(dir, "shim");
const calls = join(shim, "calls");
const realGit = execFileSync("sh", ["-c", "command -v git"], {
  encoding: "utf8",
}).trim();

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function git(repoPath: string, args: string[]): void {
  execFileSync(
    "git",
    [
      "-C",
      repoPath,
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=Test Author",
      ...args,
    ],
    {
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_AUTHOR_DATE: "2026-01-31T09:00:00Z",
        GIT_COMMITTER_DATE: "2026-01-31T09:00:00Z",
      },
    },
  );
}

// one repo carrying every shape the loader has to survive: a root commit
// with a binary file, an ordinary commit, a pure rename, and a merge
function build(): Record<string, string> {
  const path = mkdtempSync(join(dir, "repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", path]);

  writeFileSync(join(path, "a.txt"), "one\ntwo\n");
  writeFileSync(join(path, "b.txt"), "x\n");
  writeFileSync(join(path, "logo.png"), Buffer.from([0, 1, 2, 3, 0, 255]));
  git(path, ["add", "-A"]);
  git(path, ["commit", "-qm", "Plant it"]);

  writeFileSync(join(path, "a.txt"), "one\ntwo\nthree\n");
  writeFileSync(join(path, "c.txt"), "new\n");
  git(path, ["rm", "-q", "b.txt"]);
  git(path, ["add", "-A"]);
  git(path, ["commit", "-qm", "Read the list back\n\nOne query answers both."]);

  git(path, ["mv", "a.txt", "renamed.txt"]);
  git(path, ["commit", "-qm", "Rename the reader"]);

  const trunk = execFileSync("git", ["-C", path, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

  git(path, ["checkout", "-q", "-b", "side"]);
  writeFileSync(join(path, "side.txt"), "side\n");
  git(path, ["add", "-A"]);
  git(path, ["commit", "-qm", "Side work"]);
  git(path, ["checkout", "-q", "main"]);
  writeFileSync(join(path, "trunk.txt"), "trunk\n");
  git(path, ["add", "-A"]);
  git(path, ["commit", "-qm", "Trunk work"]);
  git(path, ["merge", "-q", "--no-ff", "-m", "Merge side", "side"]);

  const at = (rev: string) =>
    execFileSync("git", ["-C", path, "rev-parse", rev], {
      encoding: "utf8",
    }).trim();

  return {
    path,
    root: at(`${trunk}~2`),
    ordinary: at(`${trunk}~1`),
    rename: trunk,
    merge: at("main"),
    tree: at("main^{tree}"),
  };
}

const repo = build();
const repoPath = repo.path as string;

mkdirSync(shim, { recursive: true });
writeFileSync(
  join(shim, "git"),
  `#!/bin/sh\nprintf '%s\\n' "$*" >> ${calls}\nexec ${realGit} "$@"\n`,
);
chmodSync(join(shim, "git"), 0o755);

async function record<T>(run: () => Promise<T>): Promise<[T, string[]]> {
  const originalPath = process.env.PATH;
  writeFileSync(calls, "");
  process.env.PATH = `${shim}:${originalPath ?? ""}`;

  try {
    const result = await run();
    return [result, readFileSync(calls, "utf8").split("\n").filter(Boolean)];
  } finally {
    process.env.PATH = originalPath;
  }
}

function diffBlocks(markup: string): string[] {
  return [
    ...markup.matchAll(/<pre class="src diff"[^>]*>([\s\S]*?)<\/pre>/g),
  ].map((found) => found[1] as string);
}

function rowHrefs(markup: string): string[] {
  const list = /<ul class="files"[\s\S]*?<\/ul>/.exec(markup)?.[0] ?? "";
  return [...list.matchAll(/<a class="nm t-mono" href="([^"]+)"/g)].map(
    (found) => found[1] as string,
  );
}

test("an ordinary commit reports every path it touched, with its counts", async () => {
  const commit = await loadCommit({ repoPath, sha: repo.ordinary as string });
  assert.ok(commit);

  assert.deepStrictEqual(
    commit.files.map((file) => [file.path, file.added, file.deleted]),
    [
      ["a.txt", 1, 0],
      ["b.txt", 0, 1],
      ["c.txt", 1, 0],
    ],
  );

  assert.strictEqual(commit.subject, "Read the list back");
  assert.strictEqual(commit.body, "One query answers both.");
  assert.strictEqual(commit.author, "Test Author");
  assert.strictEqual(commit.parents.length, 1);
  assert.strictEqual(commit.signature, "N");
});

test("a root commit diffs against nothing rather than rendering empty", async () => {
  const commit = await loadCommit({ repoPath, sha: repo.root as string });
  assert.ok(commit);

  assert.deepStrictEqual(commit.parents, []);
  assert.deepStrictEqual(commit.files.map((file) => file.path).sort(), [
    "a.txt",
    "b.txt",
    "logo.png",
  ]);

  const markup = commitDocument({ commit, now: logNow });
  assert.ok(markup.includes("None — this is the first commit"));
  assert.ok(pageWireBytes(markup) <= budgetBytes);
});

test("a binary file carries the word, never a bogus count", async () => {
  const commit = await loadCommit({ repoPath, sha: repo.root as string });
  const image = commit?.files.find((file) => file.path === "logo.png");

  assert.ok(image);
  assert.strictEqual(image.added, null);
  assert.strictEqual(image.deleted, null);

  const markup = commitDocument({
    commit: commit as CommitDetail,
    now: logNow,
  });
  const row =
    /<li class="row">\s*<a[^>]*>logo\.png<\/a>\s*<span class="cnt">([^<]*)/.exec(
      markup,
    );

  assert.strictEqual(row?.[1], "Binary");
  assert.doesNotMatch(markup, /logo\.png<\/a>\s*<span class="cnt">\+NaN/);
  assert.ok(
    !markup.includes("NaN"),
    "a non-numeric numstat field reached the page as a number",
  );
});

test("a merge takes its first parent's diff, and names both parents", async () => {
  const commit = await loadCommit({ repoPath, sha: repo.merge as string });
  assert.ok(commit);

  assert.strictEqual(commit.parents.length, 2);
  assert.deepStrictEqual(
    commit.files.map((file) => file.path),
    ["side.txt"],
    "the merge showed a combined or per-parent diff rather than the first-parent one",
  );

  const markup = commitDocument({ commit, now: logNow });
  const links = commit.parents.filter((parent) =>
    markup.includes(`href="/r/linklater/commits/${parent}"`),
  );

  assert.strictEqual(links.length, 2, "a parent is not a link to its commit");
});

test("a pure rename reports both paths and inlines no diff body", async () => {
  const commit = await loadCommit({ repoPath, sha: repo.rename as string });
  const moved = commit?.files[0];

  assert.ok(moved);
  assert.strictEqual(moved.from, "a.txt");
  assert.strictEqual(moved.path, "renamed.txt");
  assert.strictEqual(moved.added, 0);
  assert.strictEqual(moved.deleted, 0);

  const markup = commitDocument({
    commit: commit as CommitDetail,
    now: logNow,
  });

  assert.strictEqual(diffBlocks(markup).length, 0, "a rename got a diff block");
  assert.ok(markup.includes('<span aria-hidden="true"> → </span>'));
  assert.ok(markup.includes("renamed to"));
});

test("one commit page costs three spawns whatever it touched", async () => {
  for (const [named, sha] of [
    ["root", repo.root],
    ["ordinary", repo.ordinary],
    ["merge", repo.merge],
  ] as const) {
    const [commit, argv] = await record(() =>
      loadCommit({ repoPath, sha: sha as string }),
    );

    assert.ok(commit);
    assert.strictEqual(
      argv.length,
      3,
      `the ${named} commit spawned git ${argv.length} times:\n${argv.join("\n")}`,
    );
    assert.ok(argv.length < 12, "the render broke CLAUDE.md's spawn budget");
    assert.ok(
      argv.every((call) => !/(^|\s)diff\s/.test(call)),
      `the ${named} commit shelled out to porcelain git diff:\n${argv.join("\n")}`,
    );
  }
});

test("an id git cannot resolve to a commit is refused, never rendered", async () => {
  const cases = [
    ["a bogus oid", "0".repeat(40)],
    ["a tree oid", repo.tree as string],
    ["a ref rather than an oid", "main"],
    ["an option", "-oops"],
    ["a short sha", (repo.ordinary as string).slice(0, 7)],
  ] as const;

  for (const [named, sha] of cases) {
    assert.strictEqual(
      await loadCommit({ repoPath, sha }),
      null,
      `${named} resolved to a commit page`,
    );
  }
});

test("a one-file commit renders whole, and still shows the file list", () => {
  const markup = commitDocument();

  assert.strictEqual(
    diffBlocks(markup).length,
    1,
    "the one diff was not inlined",
  );
  assert.match(
    markup,
    /<ul class="files" role="list">/,
    "a one-file commit skipped the file list, so its +/− counts are nowhere",
  );
  assert.deepStrictEqual(rowHrefs(markup), ["#f-0"]);
  assert.ok(markup.includes('+12<span class="vh"> added</span> −4'));
  assert.ok(pageWireBytes(markup) <= budgetBytes);
});

test("the diffs stop at the first file that would overrun, and the rest are links", () => {
  const commit = detail({ files: noisyFiles(40) });
  const markup = commitDocument({ commit, now: logNow });

  const inlined = diffBlocks(markup).length;
  const hrefs = rowHrefs(markup);

  assert.ok(
    inlined > 0,
    "nothing inlined at all, so this fixture proves the cutoff and not the rule above it",
  );
  assert.ok(
    inlined < commit.files.length,
    `all ${commit.files.length} diffs fitted, so the fixture never reaches the cutoff`,
  );

  assert.strictEqual(
    hrefs.length,
    commit.files.length,
    "the file list dropped rows when the diffs were cut",
  );

  for (const [index, href] of hrefs.entries()) {
    const path = (commit.files[index] as { path: string }).path;
    const expected =
      index < inlined
        ? `#f-${index}`
        : changeHref("linklater", commit.sha, path);

    assert.strictEqual(
      href,
      expected,
      `row ${index} of ${commit.files.length} points at ${href}; the cutoff is at ${inlined}`,
    );
  }

  // the rule is whole diffs or none: a body cut mid-hunk would read as a
  // diff that lies about what the commit did
  for (const block of diffBlocks(markup)) {
    assert.ok(
      !block.includes("Showing the first"),
      "a diff was truncated rather than turned into a link",
    );
  }
  assert.ok(!markup.includes("Showing the first"));
});

test("row markers say where a diff lives, and binary carries neither", () => {
  const commit = detail({ files: noisyFiles(40) });
  const markup = commitDocument({ commit, now: logNow });
  const inlined = diffBlocks(markup).length;
  const hrefs = rowHrefs(markup);

  assert.ok(inlined > 0 && inlined < commit.files.length);

  for (const [index, href] of hrefs.entries()) {
    const below = href === `#f-${index}`;
    assert.strictEqual(
      below,
      index < inlined,
      `row ${index} links to ${href} but the cutoff is at ${inlined}`,
    );

    const path = (commit.files[index] as { path: string }).path;
    const expected = below
      ? `>${path} <span class="t-micro">Below<span class="vh"> on this page</span></span></a>`
      : `>${path} <span class="t-micro">Own page</span></a>`;

    assert.ok(
      markup.includes(expected),
      `row for ${path} does not carry the expected marker`,
    );
  }

  const binaryMarkup = commitDocument({
    commit: detail({ files: [binaryFile] }),
    now: logNow,
  });
  assert.ok(
    binaryMarkup.includes(">assets/logo.png</a>"),
    "a binary file's row carries a marker it should not",
  );
  assert.doesNotMatch(binaryMarkup, /Own page|t-micro/);
});

test("a second sentence says how many diffs are below when the file list is not also cut", () => {
  const commit = detail({ files: noisyFiles(40) });
  const cut = commitDocument({ commit, now: logNow });
  const inlined = diffBlocks(cut).length;

  assert.doesNotMatch(
    cut,
    /Showing the first \d+ of \d+ files\./,
    "the file list itself was cut too, so this fixture does not isolate the diff-only case",
  );
  assert.ok(
    cut.includes(
      `<p class="t-label">Diffs for the first ${inlined} files are below. The rest have a page each.</p>`,
    ),
    "the cut render does not say how many diffs are below",
  );

  const whole = commitDocument();
  assert.doesNotMatch(
    whole,
    /Diffs for the first/,
    "a commit whose diffs all fit still claims some are cut",
  );
});

test("the page a cutoff produces is really under the budget, measured", () => {
  const states: [string, string][] = [
    ["one file", commitDocument()],
    [
      "forty noisy files",
      commitDocument({ commit: detail({ files: noisyFiles(40) }) }),
    ],
    [
      "two hundred noisy files",
      commitDocument({ commit: detail({ files: noisyFiles(200, 12) }) }),
    ],
    [
      "eight ordinary files",
      commitDocument({ commit: detail({ files: files(8) }) }),
    ],
    [
      "a binary file",
      commitDocument({ commit: detail({ files: [binaryFile] }) }),
    ],
    ["a rename", commitDocument({ commit: detail({ files: [renamedFile] }) })],
    ["no files at all", commitDocument({ commit: detail({ files: [] }) })],
    ["one file's own page", changeDocument("src/reader.ts")],
    [
      "one enormous file's own page",
      commitFilePage(
        view({ commit: detail({ files: noisyFiles(1, 4000) }) }),
        "src/generated/rows-0.ts",
      ) as string,
    ],
  ];

  for (const [named, markup] of states) {
    const measured = pageWireBytes(markup);

    assert.ok(
      measured <= budgetBytes,
      `${named} ships ${measured} wire bytes against a ${budgetBytes} B budget`,
    );
  }
});

// a <ul role="list"> with no <li> under it fails aria-required-children,
// and squeezing the room far enough is the one thing that produces it
test("a commit too large to list at all says so rather than emitting an empty list", () => {
  const commit = detail({ files: noisyFiles(12, 8) });
  const markup = commitDocument({ commit, now: logNow, sheetWire: 29_500 });

  assert.doesNotMatch(
    markup,
    /<ul class="files" role="list">\s*<\/ul>/,
    "an empty list reached the page",
  );
  assert.ok(markup.includes("more than this page can list"));
  assert.ok(markup.includes("git show --stat "));
  assert.strictEqual(diffBlocks(markup).length, 0);
});

// the cap is computed from what the budget has left, so shrinking the room
// has to move it; a literal would sit still while the sheet grew
test("a fatter stylesheet inlines fewer diffs", () => {
  const commit = detail({ files: noisyFiles(40) });
  const roomy = diffBlocks(commitDocument({ commit, now: logNow })).length;
  const cramped = diffBlocks(
    commitDocument({
      commit,
      now: logNow,
      sheetWire: stylesheetWireBytes + 20_000,
    }),
  ).length;

  assert.ok(
    cramped < roomy,
    `the cutoff sat at ${roomy} diffs with 20 KB less room, so it is not tracking the budget`,
  );
});

test("a single file too big for the page is cut on a line boundary", () => {
  const commit = detail({ files: noisyFiles(1, 4000) });
  const markup = commitFilePage(view({ commit }), "src/generated/rows-0.ts");

  assert.ok(markup);
  assert.match(markup, /Showing the first (\d+) lines of this diff\./);
  assert.ok(markup.includes("git show "));
  assert.ok(pageWireBytes(markup) <= budgetBytes);

  const shown = Number(/Showing the first (\d+) lines/.exec(markup)?.[1]);
  const body = diffBlocks(markup)[0] as string;

  assert.ok(shown > 0 && shown < 4000);
  assert.strictEqual(
    body.split("\n").length,
    shown,
    "the cut landed mid-line rather than on a line boundary",
  );
});

test("a path the commit does not change is a 404, not a crash", () => {
  assert.strictEqual(
    commitFilePage(view(), "src/nowhere.ts"),
    null,
    "a path outside the commit's diff rendered a page",
  );

  assert.strictEqual(noSuchChange("src/nowhere.ts").path, "/404");
  assert.strictEqual(noSuchCommit("0".repeat(40)).path, "/404");
  assert.doesNotMatch(
    `${noSuchCommit("abc").said} ${noSuchChange("a/b").next}`,
    /Oops|sorry|[!…]/i,
  );
});

test("a binary file's own page says so rather than showing bytes", () => {
  const markup = commitFilePage(
    view({ commit: detail({ files: [binaryFile] }) }),
    "assets/logo.png",
  );

  assert.ok(markup);
  assert.strictEqual(diffBlocks(markup).length, 0);
  assert.ok(
    markup.includes("This file is binary, so there&#39;s no diff to show."),
  );
});

test("the meta block is BRAND.md's four keys, with no heading in it", () => {
  const markup = commitDocument();
  const block = /<dl class="meta">[\s\S]*?<\/dl>/.exec(markup)?.[0] as string;

  assert.ok(block);
  assert.deepStrictEqual(
    [...block.matchAll(/<dt>([^<]+)<\/dt>/g)].map((found) => found[1]),
    ["Author", "Parents", "Changed", "Signed"],
  );
  assert.doesNotMatch(block, /<h[1-6][ >]/);
  assert.strictEqual(
    [...block.matchAll(/<div><dt>/g)].length,
    4,
    "the pairs are not each wrapped in a div",
  );

  assert.strictEqual([...markup.matchAll(/<h1[ >]/g)].length, 1);
  assert.doesNotMatch(markup, /<h[3-6][ >]/, "a heading level was skipped");
});

test("every signature status renders a sentence rather than a letter", () => {
  const said: Record<string, string> = {
    B: "Bad signature",
    E: "Signature can&#39;t be checked",
    G: "Good signature",
    N: "No signature",
    R: "Good signature, revoked key",
    U: "Good signature, unknown trust",
    X: "Good signature, expired",
    Y: "Good signature, expired key",
    "?": "No signature",
  };

  for (const [status, sentence] of Object.entries(said)) {
    const markup = commitDocument({
      commit: detail({ signature: status }),
      now: logNow,
    });

    assert.ok(
      markup.includes(`<dt>Signed</dt><dd>${sentence}</dd>`),
      `%G? of ${status} rendered something other than "${sentence}"`,
    );
  }
});

test("the heading, the title, and the canonical all name the commit", () => {
  const markup = commitDocument();
  const commit = detail();

  assert.ok(markup.includes('<h1 class="t-item">Read the list back</h1>'));
  assert.ok(
    markup.includes(`<p class="t-mono sha">${commit.sha.slice(0, 7)}</p>`),
    "the short sha is missing from the header",
  );
  assert.ok(markup.includes("<title>Read the list back · linklater · Càrn"));
  assert.ok(
    markup.includes(
      `content="https://carn.fancyenchiladas.net/r/linklater/commits/${commit.sha}"`,
    ),
    "og:url does not name the page it is on",
  );
  assert.ok(markup.includes("One query answers both."));

  const one = changeDocument("src/reader.ts");
  assert.ok(
    one.includes(
      `content="https://carn.fancyenchiladas.net${changeHref("linklater", commit.sha, "src/reader.ts")}"`,
    ),
    "the per-file page's canonical claims to be the whole commit",
  );
  assert.ok(
    one.includes(
      `<a class="t-mono" href="/r/linklater/commits/${commit.sha}">`,
    ),
    "the per-file page offers no way back to the commit",
  );
});

test("no page needs client JS to show a diff", () => {
  for (const markup of [
    commitDocument({ commit: detail({ files: noisyFiles(40) }) }),
    changeDocument("src/reader.ts"),
  ]) {
    assert.doesNotMatch(
      markup,
      /<script|onclick|aria-expanded|<details|<summary/,
    );
  }
});

test("a diff body marks its changed lines and leaves the rest bare", () => {
  const body = diffBlocks(commitDocument())[0] as string;

  assert.ok(
    body.includes('<span class="h">@@ '),
    "the hunk header is unmarked",
  );
  assert.ok(body.includes('<span class="a">+const fresh0'));
  assert.ok(body.includes('<span class="d">-const stale0'));
  assert.ok(
    body.includes("\n const rows = [];"),
    "a context line was wrapped, which is markup the page pays for and reads nothing from",
  );
  assert.ok(
    !body.includes("diff --git"),
    "the patch header reached the page, where the heading above it already carries the path",
  );
});

test("a text file's diff never renders whichever side is escaped", () => {
  const hostile = textFile("src/<script>.ts", 1, 1).patch as string;
  const commit = detail({
    files: [
      { ...textFile("a.ts", 1, 1), path: "src/<script>.ts", patch: hostile },
    ],
  });
  const markup = commitDocument({ commit, now: logNow });

  assert.ok(!markup.includes("<script>"), "a path reached the page unescaped");
  assert.ok(markup.includes("&lt;script&gt;"));
});

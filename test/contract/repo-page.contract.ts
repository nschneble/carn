// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { type Browser, chromium } from "playwright";

import { contentSecurityPolicy } from "../../src/app.js";
import {
  badRepoName,
  errorPage,
  noSuchRepo,
} from "../../src/html/error-page.js";
import { smallCaps } from "../../src/html/filename.js";
import { html } from "../../src/html/index.js";
import { repoShowPage, treeRowCap } from "../../src/html/repo-show.js";
import { stylesheet } from "../../src/html/styles.js";
import { headerAssetPath } from "../../src/repos/header-asset.js";
import type { ResolvedRepo } from "../../src/repos/resolve.js";
import { loadRepoView } from "../../src/repos/show.js";
import {
  files,
  hostileReadme,
  readmeSource,
  showDocument,
  view,
  wide,
} from "../gallery/repo-show.js";
import { type Served, serve } from "../support/serve.js";

function ts(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw({ raw: strings }, ...values);
}

const root = resolve(import.meta.dirname, "../../..");
const dir = mkdtempSync(join(tmpdir(), "carn-repo-page-"));
const realGit = execFileSync("sh", ["-c", "command -v git"], {
  encoding: "utf8",
}).trim();

const rowPattern = /<li class="row(?: is-dir)?">/g;

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function rows(markup: string): number {
  return [...markup.matchAll(rowPattern)].length;
}

// the doctype's own "!" is why voice checks read the copy, not the page
function empties(markup: string): string {
  return [...markup.matchAll(/<div class="empty">([\s\S]*?)<\/div>/g)]
    .map((found) => found[1] as string)
    .join("\n");
}

function readmeBody(markup: string): string {
  const opening = '<div class="readme">';
  const start = markup.indexOf(opening);

  assert.notStrictEqual(start, -1, "the page rendered no readme");
  return markup.slice(start + opening.length, markup.indexOf("</main>", start));
}

function tagsIn(markup: string): string[] {
  return markup.match(/<[a-z][^>]*>/gi) ?? [];
}

function build(tracked: Record<string, string>): ResolvedRepo {
  const path = mkdtempSync(join(dir, "repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", path]);

  for (const [name, body] of Object.entries(tracked)) {
    mkdirSync(join(path, name, ".."), { recursive: true });
    writeFileSync(join(path, name), body);
  }

  execFileSync("git", ["-C", path, "add", "-A"]);
  execFileSync(
    "git",
    [
      "-C",
      path,
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=t",
      "commit",
      "-qm",
      "x",
    ],
    { env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } },
  );

  return {
    id: "00000000-0000-4000-8000-000000000000",
    name: "linklater",
    ownerId: "owner",
    defaultBranch: "main",
    path,
  };
}

test("a real repo renders its tree and its readme", async () => {
  const repo = build({
    "README.md": "# Linklater\n\nSave a URL, read it later.\n",
    "src/index.ts": "export {};\n",
    "docs/BRAND.md": "# Brand\n",
    "package.json": "{}\n",
  });

  const loaded = await loadRepoView({ repo });

  assert.notStrictEqual(
    loaded.tip,
    null,
    "the default branch resolved to nothing",
  );
  assert.deepStrictEqual(
    loaded.entries.map((entry) => `${entry.name}${entry.directory ? "/" : ""}`),
    ["docs/", "src/", "README.md", "package.json"],
    "directories sort first, then files, each by name",
  );
  assert.ok(loaded.readme?.startsWith("# Linklater"));

  const markup = repoShowPage({ repo: loaded, showAll: false });

  assert.ok(markup.includes('<h1 class="vh">linklater</h1>'));
  assert.ok(markup.includes("<h1>Linklater</h1>"), "the readme did not render");
  assert.strictEqual(rows(markup), 4);
});

test("a nested directory contributes one row, not its contents", async () => {
  const repo = build({
    "src/a.ts": "export {};\n",
    "src/deep/b.ts": "export {};\n",
    "src/deep/c.ts": "export {};\n",
  });

  const loaded = await loadRepoView({ repo });

  assert.deepStrictEqual(
    loaded.entries.map((entry) => entry.name),
    ["src"],
  );
});

test("a repo with no readme renders the tree and says how to make one", async () => {
  const repo = build({ "package.json": "{}\n" });
  const loaded = await loadRepoView({ repo });

  assert.strictEqual(loaded.readme, null);

  const markup = repoShowPage({ repo: loaded, showAll: false });

  assert.strictEqual(rows(markup), 1, "the tree vanished with the readme");
  assert.ok(markup.includes('<div class="empty">'));
  assert.ok(markup.includes("No README yet."));
  assert.ok(
    markup.includes("README.md"),
    "the empty state never names the file",
  );
  assert.ok(markup.includes("git add README.md"), "no command to make one");
  assert.doesNotMatch(empties(markup), /[!…]|Oops/);
  assert.doesNotMatch(markup, /<div class="readme">/);
});

test("a repo with no commits says what would be here and how to push it", () => {
  const markup = showDocument({
    repo: view({ tip: null, entries: [], readme: null }),
  });

  assert.strictEqual(rows(markup), 0);
  assert.ok(markup.includes("No commits yet."));
  assert.ok(markup.includes("git push "));
  assert.doesNotMatch(
    markup,
    /No README yet/,
    "an empty repo gets one empty state, not two",
  );
  assert.doesNotMatch(empties(markup), /[!…]|Oops/);
});

test("a repo page render stays inside the spawn budget", async () => {
  const repo = build({ "README.md": "# hi\n", "src/a.ts": "export {};\n" });
  const shim = mkdtempSync(join(dir, "shim-"));
  const log = join(shim, "calls");
  const originalPath = process.env.PATH;

  writeFileSync(
    join(shim, "git"),
    `#!/bin/sh\necho call >> ${log}\nexec ${realGit} "$@"\n`,
  );
  chmodSync(join(shim, "git"), 0o755);
  writeFileSync(log, "");

  process.env.PATH = `${shim}:${originalPath ?? ""}`;

  const calls = () =>
    execFileSync("wc", ["-l", log], { encoding: "utf8" })
      .trim()
      .split(/\s+/)[0];

  try {
    await loadRepoView({ repo });
    const cold = Number(calls());

    await loadRepoView({ repo });
    const warm = Number(calls()) - cold;

    assert.strictEqual(
      cold,
      4,
      "rev-parse, ls-tree .carn, ls-tree root, cat-file",
    );
    assert.strictEqual(
      warm,
      3,
      "the header ls-tree is no longer cached on the tip",
    );
    assert.ok(cold < 12, "the page render broke CLAUDE.md's spawn budget");
  } finally {
    process.env.PATH = originalPath;
  }
});

const sentinel = "carn-probe:";
const nowhere = "postgresql://nobody:nobody@127.0.0.1:1/nothing";

const probe = ts`
const { buildApp } = await import("./dist/src/app.js");
const app = buildApp();

const invalid = await app.inject({ method: "GET", url: "/r/-nope" });
const valid = await app.inject({ method: "GET", url: "/r/linklater" });
await app.close();

console.log("${sentinel}" + JSON.stringify({
  invalid: { status: invalid.statusCode, body: invalid.body, headers: invalid.headers },
  valid: { status: valid.statusCode, body: valid.body },
}));
process.exit(0);
`;

test("an invalid repo name is refused before any database query", () => {
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", probe],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: nowhere, LOG_LEVEL: "silent" },
    },
  );

  const line = output.split("\n").find((row) => row.startsWith(sentinel));
  assert.ok(line, `the probe printed no result:\n${output}`);
  const { invalid, valid } = JSON.parse(line.slice(sentinel.length));

  assert.strictEqual(
    valid.status,
    503,
    "a well-formed name did not reach the dead database, so the invalid case proves nothing about ordering",
  );

  assert.strictEqual(invalid.status, 404);
  assert.ok(invalid.body.includes(badRepoName.heading));
  assert.doesNotMatch(invalid.body, /127\.0\.0\.1|prisma|queryRaw/i);

  assert.strictEqual(
    invalid.headers["content-security-policy"],
    contentSecurityPolicy,
  );
  assert.match(String(invalid.headers["content-type"]), /^text\/html/);
});

test("a 404 page says what happened, then what to do", () => {
  const missing = errorPage({
    failure: noSuchRepo("linklater"),
    path: "/r/linklater",
  });
  const bad = errorPage({ failure: badRepoName, path: "/r/-nope" });

  for (const markup of [missing, bad]) {
    assert.match(markup, /^<!doctype html>\n<html lang="en"/);
    assert.ok(markup.includes('<main id="main" tabindex="-1">'));
    assert.ok(markup.includes('<a class="t-mono" href="/">All repos</a>'));
    assert.strictEqual([...markup.matchAll(/<h1[ >]/g)].length, 1);
    assert.doesNotMatch(empties(markup), /Oops|sorry|[!…]/i);
    assert.doesNotMatch(markup, /<script/i);
  }

  assert.ok(
    missing.includes("There&#39;s no repo named linklater on this server."),
    "the copy no longer reaches the page through the escaping tag",
  );
  assert.ok(missing.includes("<title>No repo named linklater · Càrn</title>"));
  assert.ok(bad.includes(html`${badRepoName.said}`.value));
});

test("the tree cap holds, and show-all lifts it", () => {
  const capped = showDocument();
  const all = showDocument({ showAll: true });

  assert.strictEqual(rows(capped), treeRowCap);
  assert.strictEqual(rows(all), wide.length);

  assert.ok(capped.includes(`Show all ${wide.length}`));
  assert.ok(
    capped.includes(`href="/r/linklater?all=1"`),
    "show-all is not a real url, so it needs script to work",
  );
  assert.doesNotMatch(all, /Show all/);
  assert.doesNotMatch(capped, /<details|<summary|aria-expanded/);
});

test("a directory row carries the accent class and a trailing slash", () => {
  const markup = showDocument();

  assert.ok(
    markup.includes(
      '<li class="row is-dir"><span class="nm t-item" lang="en"><span class="sc">docs</span>/</span></li>',
    ),
    "a directory row lost its class, its lang, or its slash",
  );
  assert.ok(
    markup.includes(
      '<li class="row"><span class="nm t-item" lang="en">README.<span class="sc">md</span></span></li>',
    ),
    "a file row lost its small-caps split",
  );
});

test("small caps split lowercase runs and never insert whitespace", () => {
  const cases: [string, string][] = [
    ["README.md", 'README.<span class="sc">md</span>'],
    [
      "Button.tsx",
      'B<span class="sc">utton</span>.<span class="sc">tsx</span>',
    ],
    [".github", '.<span class="sc">github</span>'],
    ["docs", '<span class="sc">docs</span>'],
    ["LICENSE", "LICENSE"],
    [
      "package-lock.json",
      '<span class="sc">package</span>-<span class="sc">lock</span>.<span class="sc">json</span>',
    ],
  ];

  for (const [name, expected] of cases) {
    assert.strictEqual(smallCaps(name).value, expected, name);
  }

  // a filename is not a repo name, so it's not held to namePattern
  const awkward = ["café.md", "日本語.txt", "🎁.png", "Straße.md", "a b.txt"];

  for (const name of [...wide.map((entry) => entry.name), ...awkward]) {
    const markup = smallCaps(name).value;

    // a filename's own space is content; the round trip below covers it
    if (!/\s/.test(name)) {
      assert.doesNotMatch(
        markup,
        />\s+</,
        `${name} carries whitespace between runs`,
      );
    }
    assert.doesNotMatch(markup, /aria-label/, `${name} labeled an .sc span`);
    assert.strictEqual(
      markup.replace(/<[^>]*>/g, ""),
      name,
      `${name} is not what the DOM holds`,
    );
  }
});

// the mark is alt=""/aria-hidden, so the name reaches the a11y tree only
// through this h1; it's visually hidden because the mark already shows the
// name, and two adjacent labels read as one block
test("the identity mark is decorative and a visually hidden h1 carries the name", () => {
  const markup = showDocument();
  const marks = markup.match(/<svg class="mark"[^>]*>/g) ?? [];

  assert.strictEqual(marks.length, 1);
  assert.match(marks[0] as string, /aria-hidden="true"/);
  assert.ok(markup.includes('<h1 class="vh">linklater</h1>'));
  assert.doesNotMatch(
    markup,
    /<h1 class="t-label">/,
    "the repo name is a visible label again, next to the Files label it used to sit against",
  );
  assert.strictEqual(
    [...markup.matchAll(/<h1[ >]/g)].length,
    2,
    "the page h1 plus the readme's own — anything else is a heading regression",
  );

  const bare = showDocument({ repo: view({ readme: null }) });
  assert.strictEqual(
    [...bare.matchAll(/<h1[ >]/g)].length,
    1,
    "a repo with no readme heading must still have exactly one h1, and it must be the name",
  );
  assert.ok(bare.includes('<h1 class="vh">linklater</h1>'));
});

test("a committed header points at the repo's own asset route", () => {
  const image = {
    path: ".carn/header.png",
    oid: "a".repeat(40),
    bytes: 4096,
  };
  const markup = showDocument({
    repo: view({ header: { light: image, dark: image } }),
  });

  assert.ok(markup.includes(`src="${headerAssetPath("linklater", image)}"`));
  assert.ok(markup.includes('<img class="hdr"'));

  for (const tag of markup.match(/<img [^>]*class="hdr"[^>]*>/g) ?? []) {
    assert.match(tag, /alt=""/, tag);
  }

  assert.strictEqual(
    headerAssetPath("linklater", { ...image, path: ".carn/header.svg" }),
    `/r/linklater/header/${image.oid}.svg`,
  );
});

test("a hostile readme renders inert through the page", () => {
  const markup = showDocument({
    repo: view({ readme: hostileReadme }),
  });

  const body = readmeBody(markup);

  assert.doesNotMatch(markup, /<script/i);
  assert.ok(body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(body.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.doesNotMatch(body, /href="javascript:/i);
  assert.ok(body.includes("<p>[click me](javascript:alert(1))</p>"));

  // the payloads survive as text, so the check has to read real tags
  for (const tag of tagsIn(body)) {
    assert.doesNotMatch(tag, /\son[a-z]+=/i, tag);
  }

  assert.deepStrictEqual(
    tagsIn(body).filter((tag) => tag.startsWith("<img")),
    ['<img src="https://evil.example/track.png" alt="remote" />'],
    "the only live tag from a hostile readme is the remote image csp then refuses",
  );
});

test("a remote readme image survives for the csp to stop", () => {
  const markup = readmeBody(showDocument());
  const image =
    /<img src="https:\/\/example\.com\/shot\.png" alt="([^"]*)"[^>]*>/.exec(
      markup,
    );

  assert.ok(
    image,
    "the markdown layer stripped a remote image it should have kept",
  );
  assert.strictEqual(image[1], "A screenshot of the reading list");
});

test("external readme links carry the rel and local ones do not", () => {
  const markup = showDocument();
  const anchors = tagsIn(readmeBody(markup)).filter((tag) =>
    tag.startsWith("<a "),
  );

  assert.ok(anchors.length >= 5, "the readme fixture lost its links");

  for (const anchor of anchors) {
    const href = /href="([^"]*)"/.exec(anchor)?.[1] ?? "";
    const external = href.startsWith("http");

    assert.strictEqual(
      anchor.includes('rel="nofollow ugc"'),
      external,
      `${anchor} carries the wrong rel for ${href}`,
    );
  }

  assert.ok(anchors.some((anchor) => anchor.includes('href="docs/BRAND.md"')));
  assert.ok(anchors.some((anchor) => anchor.includes('href="/docs/spec"')));
  assert.ok(anchors.some((anchor) => anchor.includes('href="#type"')));
  assert.ok(anchors.some((anchor) => anchor.includes("mailto:")));
});

test("no repo page carries script, an inline style, or a style attribute", () => {
  for (const showAll of [false, true]) {
    const markup = showDocument({ showAll });

    assert.doesNotMatch(markup, /<script/i);
    assert.doesNotMatch(markup, /<style[ >]/i);
    assert.doesNotMatch(markup, / style=/i);
    assert.doesNotMatch(markup, /\son[a-z]+=/i);
  }
});

test("the repo page fits the weight budget, fonts and stylesheet in", () => {
  const faces = [
    "carn-sans.woff2",
    "carn-mono-400.woff2",
    "carn-mono-500.woff2",
  ];
  const fixed =
    faces.reduce(
      (total, face) => total + statSync(join(root, "fonts", face)).size,
      0,
    ) + Buffer.byteLength(stylesheet, "utf8");

  for (const [state, markup] of [
    ["capped", showDocument()],
    ["show-all", showDocument({ showAll: true })],
    [
      "empty",
      showDocument({
        repo: view({ tip: null, entries: [], readme: null }),
      }),
    ],
  ] as const) {
    const weight = fixed + Buffer.byteLength(markup, "utf8");

    assert.ok(
      weight < 100 * 1024,
      `the ${state} repo page weighs ${weight} B against a 102400 B budget`,
    );
  }
});

test("the readme fixture is the one the assertions above assume", () => {
  assert.ok(readmeSource.includes("| Ref | Kind | Note |"), "lost its table");
  assert.ok(readmeSource.includes("```sh"), "lost its fenced code");
  assert.ok(files.some((entry) => entry.name === "README.md"));
});

let browser: Browser;
let site: Served;

before(async () => {
  browser = await chromium.launch();
  site = await serve({
    documents: {
      "/show": showDocument(),
      "/show-all": showDocument({ showAll: true }),
    },
  });
});

after(async () => {
  await browser?.close();
  await site?.close();
});

test("the rendered dom holds the true filename under small caps", async () => {
  const page = await browser.newPage();

  try {
    await page.goto(`${site.origin}/show-all`);

    const read = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".tree .nm")).map((node) => ({
        text: node.textContent ?? "",
        lang: node.getAttribute("lang"),
        caps: Array.from(node.querySelectorAll(".sc")).map(
          (span) => getComputedStyle(span).textTransform,
        ),
      })),
    );

    assert.strictEqual(read.length, wide.length);

    for (const [index, entry] of wide.entries()) {
      const found = read[index];
      const expected = `${entry.name}${entry.directory ? "/" : ""}`;

      assert.ok(found, entry.name);
      assert.strictEqual(
        found.text,
        expected,
        "the dom does not hold the real name",
      );
      assert.strictEqual(found.lang, "en", `${entry.name} lost lang="en"`);
    }

    const transforms = new Set(read.flatMap((found) => found.caps));
    assert.deepStrictEqual(
      [...transforms],
      ["uppercase"],
      "the .sc spans are not being uppercased, so nothing is in small caps and the dom check proves nothing",
    );
  } finally {
    await page.close();
  }
});

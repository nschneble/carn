// SPDX-License-Identifier: AGPL-3.0-or-later

// the ancestor links are followed over real http against the real route
// table, because an href that merely looks like a url is the defect worth
// catching. only the repo row lookup is stubbed: the repo on disk, the
// routes, the handlers and the git below them are all real

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "carn-crumbs-"));
const repoRoot = join(dir, "repos");
const repoId = "55555555-5555-4555-8555-555555555555";
const repoName = "linklater";
const deep = "a/b/c.ts";

process.env.CARN_REPO_ROOT = repoRoot;
process.env.DATABASE_URL ??= "postgresql://nobody:nobody@127.0.0.1:1/nothing";
process.env.LOG_LEVEL = "silent";

const { blobDocument } = await import("../gallery/blob.js");
const { indexDocument } = await import("../gallery/repo-index.js");
const { showDocument } = await import("../gallery/repo-show.js");
const { treeDocument } = await import("../gallery/tree.js");
const { logDocument } = await import("../gallery/commit-log.js");
const { textBlob } = await import("../gallery/blob.js");
const { breadcrumb, pathTrail, repoTrail } = await import(
  "../../src/html/breadcrumb.js"
);
const { stylesheet } = await import("../../src/html/styles.js");
const { browser, closeBrowser } = await import("../support/browser.js");
const { serve } = await import("../support/serve.js");
const { renderPaths } = await import("../support/render-paths.js");

type Served = Awaited<ReturnType<typeof serve>>;

function git(at: string, args: string[]): string {
  return execFileSync("git", ["-C", at, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_DATE: "2026-01-10T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-10T00:00:00Z",
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  }).trim();
}

// the bare repo the routes read, at the path repoPath() derives from an id
function buildRepo(): void {
  const work = join(dir, "work");
  const bare = join(repoRoot, repoId.slice(0, 2), `${repoId}.git`);

  mkdirSync(work, { recursive: true });
  mkdirSync(dirname(bare), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", "--", work]);

  for (const path of ["README.md", deep, "a/b/d.ts", "a/e.ts"]) {
    mkdirSync(join(work, dirname(path)), { recursive: true });
    writeFileSync(join(work, path), `export const at = "${path}";\n`);
  }

  git(work, ["add", "-A"]);
  git(work, ["commit", "-qm", "Lay the tree down"]);
  execFileSync("git", ["clone", "-q", "--bare", work, bare]);
}

buildRepo();

const { db } = await import("../../src/db.js");

const lookupRow = {
  id: repoId,
  name: repoName,
  ownerId: "66666666-6666-4666-8666-666666666666",
  defaultBranch: "main",
};

const summaryRow = {
  name: repoName,
  description: "Save a URL, read it later.",
  createdAt: new Date("2026-01-18T09:00:00.000Z"),
};

// the two raw reads the page routes make, answered from pinned rows; every
// other layer below the route stays the real one
db.$queryRaw = ((strings: TemplateStringsArray) =>
  Promise.resolve(
    strings.join("").includes("ORDER BY") ? [summaryRow] : [lookupRow],
  )) as never;

const { buildApp } = await import("../../src/app.js");

const app = buildApp();
let origin = "";
let site: Served;

const deepBlob = blobDocument({
  blob: textBlob(
    "apps/web/src/components/ThemeEditor/index.ts",
    "export {};\n",
  ),
});

const fixtures: Record<string, string> = {
  "/index-page": indexDocument(),
  "/show": showDocument(),
  "/tree": treeDocument(),
  "/commits": logDocument(),
  "/deep-blob": deepBlob,
};

before(async () => {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  assert.ok(address !== null && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;

  site = await serve({ documents: fixtures });
});

after(async () => {
  await closeBrowser();
  await site?.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

function crumbList(markup: string): string {
  const start = markup.indexOf('<nav aria-label="Breadcrumb">');
  assert.notStrictEqual(start, -1, "the page rendered no breadcrumb");
  return markup.slice(start, markup.indexOf("</nav>", start) + 6);
}

function hrefs(markup: string): string[] {
  return [...crumbList(markup).matchAll(/<a href="([^"]+)"/g)].map(
    (found) => found[1] as string,
  );
}

// the folded trail is the case a count of separator spans alone would
// miss: the ellipsis item carries its own », hidden by the <li> around it
test("the separator is real dom text, and every one is aria-hidden", () => {
  for (const [where, markup] of [
    ["a short trail", treeDocument()],
    ["a folded trail", deepBlob],
  ] as const) {
    const nav = crumbList(markup);
    const separators = [...nav.matchAll(/»/g)].length;
    const exposed = nav
      .replace(/<span aria-hidden="true"> » <\/span>/g, "")
      .replace(/<li class="fold" aria-hidden="true">[^<]*<\/li>/g, "");

    assert.ok(separators > 1, `${where}: only ${separators} separators`);
    assert.doesNotMatch(
      exposed,
      /»|…/,
      `${where}: punctuation reached the accessible name`,
    );
  }

  assert.doesNotMatch(
    stylesheet,
    /\.crumbs[^{]*\{[^}]*content:/,
    "the separator moved into generated content, which cannot be selected and is not found by Ctrl-F",
  );
});

test("ancestors are links, and the current segment is not", () => {
  const nav = crumbList(treeDocument());
  const links = [...nav.matchAll(/<a /g)].length;
  const here = [...nav.matchAll(/<span class="here">/g)].length;

  assert.strictEqual(here, 1, "there is not exactly one current segment");
  assert.strictEqual(links, 3, `Càrn, linklater and src should link: ${nav}`);
  assert.ok(
    nav.endsWith('<span class="here">components</span></li></ol></nav>'),
    `the current segment is not last, or it links: ${nav}`,
  );
});

// the wordmark on / is the current segment and keeps the treatment it
// already has, so the index is the one page this wave must not touch
test("the index page keeps its own masthead, unchanged", () => {
  const markup = indexDocument();

  assert.ok(
    markup.includes(
      '<a class="skip" href="#main">Skip to content</a>\n      <p class="t-mono"><a class="home" href="/">Càrn</a></p>',
    ),
    "the index masthead changed shape",
  );
  assert.doesNotMatch(markup, /aria-label="Breadcrumb"/);
});

test("the breadcrumb does not replace the repo page's .vh heading", () => {
  const markup = showDocument();

  assert.ok(markup.includes('<h1 class="vh">linklater</h1>'));
  assert.ok(markup.includes('aria-label="Breadcrumb"'));
  assert.doesNotMatch(
    crumbList(markup),
    /<h[1-6]/,
    "the breadcrumb grew a heading, which is what lets the mark stay decorative",
  );
});

// four or fewer segments can never collapse, so rendering the fold and the
// hidden set would be markup no viewport ever shows
test("a trail with nothing to hide renders no fold and no hidden segments", () => {
  const short = crumbList(logDocument());

  assert.doesNotMatch(short, /class="fold"|class="mid"/);
  assert.strictEqual([...short.matchAll(/<li/g)].length, 3);

  // eight segments, so the four between the first two and the last two
  // fold into one ellipsis rather than shedding one at a time
  const long = crumbList(deepBlob);
  assert.strictEqual([...long.matchAll(/<li/g)].length, 9);
  assert.strictEqual([...long.matchAll(/class="mid"/g)].length, 4);
  assert.strictEqual([...long.matchAll(/class="fold"/g)].length, 1);
});

test("every path segment carries the tree route at its own depth", () => {
  assert.deepStrictEqual(pathTrail("linklater", "main", "a/b/c.ts"), [
    { label: "a", href: "/r/linklater/tree/main/a" },
    { label: "b", href: "/r/linklater/tree/main/a/b" },
    { label: "c.ts", href: null },
  ]);

  // a ref carrying a slash and a name carrying a hash go through treeHref,
  // so the encoding is the tree route's own rather than a second spelling
  assert.deepStrictEqual(pathTrail("linklater", "feat/x", "a b/c#d.ts"), [
    { label: "a b", href: "/r/linklater/tree/feat%2Fx/a%20b" },
    { label: "c#d.ts", href: null },
  ]);
});

test("a label is escaped into the trail", () => {
  const nav = breadcrumb([
    ...repoTrail("linklater"),
    { label: "<script>alert(1)</script>", href: null },
  ]).value;

  assert.ok(!nav.includes("<script"), nav);
  assert.ok(nav.includes("&lt;script&gt;"));
});

// the three signals BRAND.md asks for, read off the rendered page rather
// than off the stylesheet: color, weight, and the absence of a target
test("the current segment is inked and weighted apart from its ancestors", async (t) => {
  const page = await (await browser()).newPage();

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const path of renderPaths) {
      await page.emulateMedia({ colorScheme: path.colorScheme });
      await page.goto(`${site.origin}/deep-blob`);
      await page.evaluate(() => document.fonts.ready);

      const read = await page.locator(".crumbs").evaluate((node) => {
        const style = getComputedStyle(node);
        const ancestor = node.querySelector("a") as HTMLElement;
        const here = node.querySelector(".here") as HTMLElement;

        return {
          mid: style.getPropertyValue("--ink-mid").trim(),
          ink: style.getPropertyValue("--ink").trim(),
          ancestorColor: getComputedStyle(ancestor).color,
          ancestorTag: ancestor.tagName,
          hereColor: getComputedStyle(here).color,
          hereTag: here.tagName,
          hereWeight: getComputedStyle(here).fontWeight,
          hereLinks: here.querySelectorAll("a").length,
        };
      });

      const rgb = (hex: string) => {
        const n = hex.replace("#", "");
        return `rgb(${[0, 2, 4].map((at) => Number.parseInt(n.slice(at, at + 2), 16)).join(", ")})`;
      };

      assert.strictEqual(
        read.ancestorColor,
        rgb(read.mid),
        `${path.name}: an ancestor is not --ink-mid`,
      );
      assert.strictEqual(read.ancestorTag, "A");
      assert.strictEqual(
        read.hereColor,
        rgb(read.ink),
        `${path.name}: the current segment is not --ink`,
      );
      assert.strictEqual(read.hereWeight, "500");
      assert.notStrictEqual(
        read.hereTag,
        "A",
        `${path.name}: the current segment is a link`,
      );
      assert.strictEqual(read.hereLinks, 0);

      t.diagnostic(
        `${path.name}: ancestor ${read.ancestorColor}, current ${read.hereColor} at ${read.hereWeight}`,
      );
    }
  } finally {
    await page.close();
  }
});

// the collapse is the wave's new invariant, so it is read in both
// directions off the accessibility tree, which is where display: none is
// the whole point rather than a side effect
test("the collapse drops the middle from the layout and the a11y tree", async (t) => {
  const page = await (await browser()).newPage();
  const whole = [
    "Càrn",
    "linklater",
    "apps",
    "web",
    "src",
    "components",
    "ThemeEditor",
    "index.ts",
  ];
  const folded = ["Càrn", "linklater", "ThemeEditor", "index.ts"];

  // the two lines BRAND.md prints as the component's own example, read back
  // off the rendered page: real text, so selection and Ctrl-F get the path
  const lines: Record<number, string> = {
    1440: "Càrn » linklater » apps » web » src » components » ThemeEditor » index.ts",
    375: "Càrn » linklater » … » ThemeEditor » index.ts",
  };

  try {
    for (const [width, expected] of [
      [1440, whole],
      [375, folded],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${site.origin}/deep-blob`);
      await page.evaluate(() => document.fonts.ready);

      const tree = await page
        .locator("nav[aria-label=Breadcrumb]")
        .ariaSnapshot();
      const named = [
        ...tree.matchAll(/- link "([^"]+)"|- listitem: (.+)$/gm),
      ].map((found) => (found[1] ?? found[2] ?? "").trim());

      assert.deepStrictEqual(
        named,
        expected,
        `at ${width}px the accessibility tree reads ${named.join(" » ")}\n${tree}`,
      );

      const laidOut = await page
        .locator(".crumbs li")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => getComputedStyle(node).display !== "none")
            .map((node) => (node.textContent ?? "").replace(/[»…\s]+/g, "")),
        );

      assert.deepStrictEqual(
        laidOut.filter((text) => text !== ""),
        expected,
        `at ${width}px the layout shows ${laidOut.join(" » ")}`,
      );

      const read = await page
        .locator(".crumbs")
        .evaluate((node) => (node as HTMLElement).innerText.trim());

      assert.strictEqual(
        read.replace(/\s+/g, " "),
        lines[width],
        `at ${width}px the breadcrumb reads back as "${read}"`,
      );

      t.diagnostic(`${width}px: ${read.replace(/\s+/g, " ")}`);
    }
  } finally {
    await page.close();
  }
});

// an href that reaches no route is the defect, and only a request can tell
// one from a plausible string
test("every ancestor link on a blob three levels deep answers 200", async (t) => {
  const url = `${origin}/r/${repoName}/blob/main/${deep}`;
  const response = await fetch(url);
  const markup = await response.text();

  assert.strictEqual(
    response.status,
    200,
    `${url} answered ${response.status}`,
  );

  const ancestors = hrefs(markup);
  assert.strictEqual(ancestors.length, 4, "the trail is not four deep");

  // the request comes first on purpose: a plausible href that reaches no
  // route is the defect, and only following it can tell the two apart
  for (const href of ancestors) {
    const followed = await fetch(`${origin}${href}`);
    const body = await followed.text();

    assert.strictEqual(
      followed.status,
      200,
      `${href} answered ${followed.status}, so an ancestor link resolves to no route`,
    );
    assert.match(
      String(followed.headers.get("content-type")),
      /^text\/html/,
      `${href} did not answer with a page`,
    );
    assert.doesNotMatch(
      body,
      /No repo here|No directory here|No file here|Unavailable/,
      `${href} answered 200 with an error page`,
    );

    t.diagnostic(`${href}: ${followed.status}`);
  }

  assert.deepStrictEqual(
    ancestors,
    [
      "/",
      `/r/${repoName}`,
      `/r/${repoName}/tree/main/a`,
      `/r/${repoName}/tree/main/a/b`,
    ],
    "the trail on a three-deep blob is not site, repo, a, b",
  );
  assert.ok(
    markup.includes('<span class="here">c.ts</span>'),
    "the filename is not the current segment",
  );

  // a 200 alone would not catch a tree link that listed the root, so pin
  // that the deepest ancestor really listed its own directory
  const listed = await (
    await fetch(`${origin}/r/${repoName}/tree/main/a/b`)
  ).text();

  assert.ok(
    listed.includes(
      '<h1 class="t-item t-item--title" lang="en"><span class="caps">a/b</span></h1>',
    ),
    "the a/b ancestor answered 200 with some other page",
  );
  assert.ok(listed.includes(`/r/${repoName}/blob/main/a/b/c.ts`));
});

// following the trail up from a nested tree has to land on the repo page,
// which is the root tree and the one depth the tree route has no form for
test("the trail from a nested tree page climbs to the repo page", async () => {
  const markup = await (
    await fetch(`${origin}/r/${repoName}/tree/main/a/b`)
  ).text();

  assert.deepStrictEqual(hrefs(markup), [
    "/",
    `/r/${repoName}`,
    `/r/${repoName}/tree/main/a`,
  ]);
  assert.ok(markup.includes('<span class="here">b</span>'));

  const repoPage = await fetch(`${origin}/r/${repoName}`);
  assert.strictEqual(repoPage.status, 200);
  assert.ok(
    (await repoPage.text()).includes(`<h1 class="vh">${repoName}</h1>`),
  );
});

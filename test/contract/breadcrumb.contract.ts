// SPDX-License-Identifier: AGPL-3.0-or-later

// the ancestor links are followed over http against the route table; only
// the repo row lookup is stubbed

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
const { treeDocument } = await import("../gallery/tree.js");
const { textBlob } = await import("../gallery/blob.js");
const { address, pathNav, pathTrail, revTrail } = await import(
  "../../src/html/breadcrumb.js"
);
const { plainName } = await import("../../src/html/filename.js");
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
  "/tree": treeDocument(),
  "/deep-blob": deepBlob,
};

before(async () => {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  site = await serve({ documents: fixtures });
});

after(async () => {
  await closeBrowser();
  await site?.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

function sidebar(markup: string): string {
  const opener = '<nav class="list-nav" aria-labelledby="path-label">';
  const start = markup.indexOf(opener);
  assert.notStrictEqual(start, -1, "the page rendered no Path sidebar");
  return markup.slice(start, markup.indexOf("</nav>", start) + 6);
}

function hrefs(markup: string): string[] {
  return [...sidebar(markup).matchAll(/<a href="([^"]+)"/g)].map(
    (found) => found[1] as string,
  );
}

function crumbFields(crumbs: ReturnType<typeof pathTrail>) {
  return crumbs.map((crumb) => ({
    label: crumb.label.value,
    href: crumb.href,
    container: crumb.container,
  }));
}

test("the Path nav is a labeled list, and the label is its own heading", () => {
  const nav = pathNav(revTrail(repoName, "main", "main")).value;

  assert.match(nav, /^<nav class="list-nav" aria-labelledby="path-label">/);
  assert.ok(nav.includes('<p class="t-label" id="path-label">Path</p>'));
  assert.ok(nav.includes('<ol role="list">'));

  for (const markup of [treeDocument(), deepBlob]) {
    assert.strictEqual(
      [...markup.matchAll(/id="path-label"/g)].length,
      1,
      "the page carries the Path label id more than once",
    );
    assert.deepStrictEqual(
      [...markup.matchAll(/<nav [^>]*aria-labelledby="([^"]+)"/g)].map(
        (found) => found[1],
      ),
      ["path-label"],
      "a nav on the page is labeled by something other than path-label",
    );
  }
});

test("every path segment carries the tree route at its own depth", () => {
  assert.deepStrictEqual(
    crumbFields(pathTrail(repoName, "main", "a/b/c.ts", "blob")),
    [
      {
        label: '<span class="caps">a</span>',
        href: "/r/linklater/tree/main/a",
        container: true,
      },
      {
        label: '<span class="caps">b</span>',
        href: "/r/linklater/tree/main/a/b",
        container: true,
      },
      { label: '<span class="caps">c.ts</span>', href: null, container: false },
    ],
  );

  // a ref carrying a slash and a name carrying a hash go through treeHref,
  // so the encoding is the tree route's own rather than a second spelling
  assert.deepStrictEqual(
    crumbFields(pathTrail(repoName, "feat/x", "a b/c#d.ts", "blob")),
    [
      {
        label: '<span class="caps">a b</span>',
        href: "/r/linklater/tree/feat%2Fx/a%20b",
        container: true,
      },
      {
        label: '<span class="caps">c#d.ts</span>',
        href: null,
        container: false,
      },
    ],
  );

  assert.deepStrictEqual(
    crumbFields(pathTrail(repoName, "main", "a/b", "tree")).at(-1),
    { label: '<span class="caps">b</span>', href: null, container: true },
  );
});

test("a hostile filename is escaped on its way into the label", () => {
  const hostile = "<script>alert(1)</script>.ts";
  const nav = pathNav([
    ...revTrail(repoName, "main", "main"),
    { label: plainName(hostile), href: null, container: false },
  ]).value;

  assert.ok(!nav.includes("<script"), nav);
  assert.ok(nav.includes("&lt;script&gt;alert(1)&lt;/script&gt;.ts"));

  assert.ok(
    !address([
      { label: plainName(hostile), href: null, container: false },
    ]).value.includes("<script"),
  );
});

test("a container ends in a slash and the current item is unlinked", () => {
  const nav = sidebar(treeDocument());

  assert.ok(
    nav.includes(
      '<li aria-current="page"><span class="caps">components</span>/</li>',
    ),
    `the tree's own path isn't an unlinked container: ${nav}`,
  );
  assert.strictEqual(
    [...nav.matchAll(/aria-current="page"/g)].length,
    1,
    "the sidebar marks more than one current item",
  );

  const blob = sidebar(deepBlob);
  assert.ok(
    blob.includes(
      '<li aria-current="page"><span class="caps">index.ts</span></li>',
    ),
    `the blob's own name isn't an unlinked leaf: ${blob}`,
  );
  for (const [where, markup] of [
    ["tree", nav],
    ["blob", blob],
  ] as const) {
    const linked = [...markup.matchAll(/<li><a [^>]*>(.*?)<\/a><\/li>/g)].map(
      (found) => found[1] as string,
    );

    assert.ok(linked.length > 1, `${where}: the trail carries no ancestors`);
    for (const segment of linked) {
      assert.ok(
        segment.endsWith("/"),
        `${where}: the ancestor ${segment} doesn't end in a slash`,
      );
    }
  }
});

// wordmark on / is the current segment and keeps treatment it already has
test("the index page keeps its own masthead, unchanged", () => {
  const markup = indexDocument();

  assert.ok(
    markup.includes(
      '<a class="skip" href="#main">Skip to content</a>\n      <p><a class="home" href="/">Càrn</a></p>',
    ),
    "the index masthead changed shape",
  );
  assert.doesNotMatch(markup, /class="list-nav"/);
});

// a .page-head selects the show grid and its absence the list grid
test("the show grid follows .page-head, and the list grid its absence", async (t) => {
  const page = await (await browser()).newPage();

  try {
    const expected = {
      1440: {
        list: { rows: 1, sideRow: "1" },
        show: { rows: 2, sideRow: "1 / span 2" },
      },
      375: {
        list: { rows: 2, sideRow: "auto" },
        show: { rows: 3, sideRow: "auto" },
      },
    };

    for (const width of [1440, 375] as const) {
      await page.setViewportSize({ width, height: 900 });

      for (const [path, shape] of [
        ["/tree", "list"],
        ["/deep-blob", "show"],
      ] as const) {
        await page.goto(`${site.origin}${path}`);
        await page.evaluate(() => document.fonts.ready);

        const read = await page.locator(".page-body").evaluate((node) => {
          const side = node.querySelector(".page-side") as HTMLElement;
          const main = node.querySelector(".page-main") as HTMLElement;
          const style = getComputedStyle(node);

          return {
            heads: node.querySelectorAll(":scope > .page-head").length,
            columns: style.gridTemplateColumns.split(" ").length,
            rows: style.gridTemplateRows.split(" ").length,
            sideRow: getComputedStyle(side).gridRow,
            sideTop: Math.round(side.getBoundingClientRect().top),
            mainTop: Math.round(main.getBoundingClientRect().top),
          };
        });

        const want = expected[width][shape];

        assert.strictEqual(
          read.heads,
          shape === "show" ? 1 : 0,
          `${path} at ${width}px is the wrong shape for this assertion`,
        );
        assert.strictEqual(
          read.columns,
          width === 1440 ? 2 : 1,
          `${path} at ${width}px lays out ${read.columns} column(s)`,
        );
        assert.strictEqual(
          read.rows,
          want.rows,
          `${path} at ${width}px lays out ${read.rows} row(s), wanted ${want.rows}`,
        );
        assert.strictEqual(
          read.sideRow,
          want.sideRow,
          `${path} at ${width}px put the sidebar on grid-row ${read.sideRow}`,
        );

        if (width === 1440) {
          assert.ok(
            shape === "show"
              ? read.mainTop > read.sideTop
              : read.mainTop === read.sideTop,
            `${path} at ${width}px: sidebar top ${read.sideTop}, content top ${read.mainTop}`,
          );
        }

        t.diagnostic(
          `${path} ${shape} at ${width}px: ${read.columns}x${read.rows}, side row ${read.sideRow}, tops ${read.sideTop}/${read.mainTop}`,
        );
      }
    }
  } finally {
    await page.close();
  }
});

// the three signals BRAND.md asks for, read off the rendered page rather
// than off the stylesheet: color, hit area, and the absence of a target
test("an ancestor is a link that clears 24px; the current item is neither", async (t) => {
  const page = await (await browser()).newPage();

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const path of renderPaths) {
      await page.emulateMedia({ colorScheme: path.colorScheme });
      await page.goto(`${site.origin}/deep-blob`);
      await page.evaluate(() => document.fonts.ready);

      const read = await page.locator(".list-nav").evaluate((node) => {
        const style = getComputedStyle(node);
        const link = node.querySelector("a") as HTMLElement;
        const here = node.querySelector('[aria-current="page"]') as HTMLElement;

        return {
          accent: style.getPropertyValue("--accent-text").trim(),
          ink: style.getPropertyValue("--ink").trim(),
          linkColor: getComputedStyle(link).color,
          linkDisplay: getComputedStyle(link).display,
          linkBox: link.getBoundingClientRect(),
          hereColor: getComputedStyle(here).color,
          hereTag: here.tagName,
          hereLinks: here.querySelectorAll("a").length,
        };
      });

      const rgb = (hex: string) => {
        const n = hex.replace("#", "");
        return `rgb(${[0, 2, 4].map((at) => Number.parseInt(n.slice(at, at + 2), 16)).join(", ")})`;
      };

      assert.strictEqual(
        read.linkColor,
        rgb(read.accent),
        `${path.name}: an ancestor isn't --accent-text`,
      );
      assert.strictEqual(read.linkDisplay, "inline-block");
      assert.ok(
        read.linkBox.height >= 24,
        `${path.name}: an ancestor link is ${read.linkBox.height}px tall, under the 24px floor`,
      );
      assert.strictEqual(
        read.hereColor,
        rgb(read.ink),
        `${path.name}: the current item isn't --ink`,
      );
      assert.strictEqual(read.hereTag, "LI");
      assert.strictEqual(read.hereLinks, 0);

      t.diagnostic(
        `${path.name}: ancestor ${read.linkColor} at ${read.linkBox.height}px, current ${read.hereColor}`,
      );
    }
  } finally {
    await page.close();
  }
});

// requires an actual request to disambiguate real links
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
  assert.strictEqual(ancestors.length, 4, "the trail isn't four deep");

  for (const href of ancestors) {
    const followed = await fetch(`${origin}${href}`);
    const body = await followed.text();

    assert.strictEqual(
      followed.status,
      200,
      `${href} answered ${followed.status}, so an ancestor link doesn't resolve`,
    );
    assert.match(
      String(followed.headers.get("content-type")),
      /^text\/html/,
      `${href} didn't answer with a page`,
    );
    assert.doesNotMatch(
      body,
      /No repo here|No dir here|No file here|Unavailable/,
      `${href} answered 200 with an error page`,
    );

    t.diagnostic(`${href}: ${followed.status}`);
  }

  assert.deepStrictEqual(
    ancestors,
    [
      `/r/${repoName}`,
      `/r/${repoName}`,
      `/r/${repoName}/tree/main/a`,
      `/r/${repoName}/tree/main/a/b`,
    ],
    "the trail on a three-deep blob isn't repo, rev, a, b",
  );
  assert.ok(
    markup.includes(
      '<li aria-current="page"><span class="caps">c.ts</span></li>',
    ),
    "the filename isn't the current item",
  );

  // a 200 alone wouldn't catch a tree link that listed the root, so pin
  // that the deepest ancestor really listed its own directory
  const listed = await (
    await fetch(`${origin}/r/${repoName}/tree/main/a/b`)
  ).text();

  assert.ok(
    listed.includes(`<h1 class="vh">${repoName}/main/a/b</h1>`),
    "the a/b ancestor answered 200 with some other page",
  );
  assert.ok(listed.includes(`/r/${repoName}/blob/main/a/b/c.ts`));
});

// following the trail up from a nested tree has to land on the repo page
test("the trail from a nested tree page climbs to the repo page", async () => {
  const markup = await (
    await fetch(`${origin}/r/${repoName}/tree/main/a/b`)
  ).text();

  assert.deepStrictEqual(hrefs(markup), [
    `/r/${repoName}`,
    `/r/${repoName}`,
    `/r/${repoName}/tree/main/a`,
  ]);
  assert.ok(
    markup.includes(
      '<li aria-current="page"><span class="caps">b</span>/</li>',
    ),
  );

  const repoPage = await fetch(`${origin}/r/${repoName}`);
  assert.strictEqual(repoPage.status, 200);
  assert.ok(
    (await repoPage.text()).includes(`<h1 class="vh">${repoName}</h1>`),
  );
});

// SPDX-License-Identifier: AGPL-3.0-or-later

// SC 1.4.12 at 320px, the width the criterion is written for. axe's own
// avoid-inline-spacing only looks for style attributes fighting a user
// sheet, and this stylesheet sets none, so nothing else measures what the
// four overrides do to a row table

import assert from "node:assert";
import { after, before, test } from "node:test";

import { commitDocument } from "../gallery/commit.js";
import { logDocument } from "../gallery/commit-log.js";
import { refsDocument } from "../gallery/refs.js";
import { indexDocument } from "../gallery/repo-index.js";
import { treeDocument } from "../gallery/tree.js";
import { browser, closeBrowser } from "../support/browser.js";
import { type Served, serve } from "../support/serve.js";

// the four declarations SC 1.4.12 names, at the values it names
const spacingCss = `* {
  line-height: 1.5 !important;
  letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important;
}
p {
  margin-bottom: 2em !important;
}`;

const reflowWidth = 320;
const minTarget = 24;

const documents: Record<string, string> = {
  "/tree": treeDocument(),
  "/refs": refsDocument(),
  "/index": indexDocument(),
  "/log": logDocument(),
  "/commit": commitDocument(),
};

type Cell = {
  key: string;
  column: string;
  width: number;
  height: number;
  ellipsed: boolean;
};

type Reading = {
  scrollWidth: number;
  clientWidth: number;
  letterSpacing: string;
  rows: number;
  columns: number[];
  cells: Cell[];
};

// read in the page: the boxes a user agent actually laid out, never a
// number this side computed from the markup
function readTable(): Reading {
  const root = document.documentElement;
  const body = document.querySelector(".tbl tbody") as HTMLElement | null;
  const cells = [
    ...document.querySelectorAll(".tbl tbody th, .tbl tbody td"),
  ].flatMap((cell) => {
    const child = cell.firstElementChild as HTMLElement | null;
    if (child === null) return [];

    const box = child.getBoundingClientRect();
    const column = (cell.className.split(/\s+/)[0] ?? "").trim();

    return [
      {
        key: `${column}|${(child.textContent ?? "").trim()}`,
        column,
        width: box.width,
        height: box.height,
        // scrollWidth rounds up, so a whole pixel of slack is the floor
        // below which nothing is actually cut
        ellipsed: child.scrollWidth > Math.ceil(box.width) + 1,
      },
    ];
  });

  const header = [...document.querySelectorAll(".tbl thead th")];

  return {
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    letterSpacing: body === null ? "" : getComputedStyle(body).letterSpacing,
    rows: document.querySelectorAll(".tbl tbody tr").length,
    columns: header.map((cell) =>
      Math.round(cell.getBoundingClientRect().width),
    ),
    cells,
  };
}

async function readAll(site: Served): Promise<Record<string, Reading>> {
  const page = await (await browser()).newPage();
  const out: Record<string, Reading> = {};

  try {
    await page.setViewportSize({ width: reflowWidth, height: 900 });
    for (const path of Object.keys(documents)) {
      await page.goto(`${site.origin}${path}`);
      await page.evaluate(() => document.fonts.ready);
      out[path] = (await page.evaluate(readTable)) as Reading;
    }
  } finally {
    await page.close();
  }

  return out;
}

let plain: Record<string, Reading>;
let spaced: Record<string, Reading>;

before(async () => {
  const bare = await serve({ documents });
  plain = await readAll(bare);
  await bare.close();

  const wide = await serve({ documents, extraCss: spacingCss });
  spaced = await readAll(wide);
  await wide.close();
});

after(closeBrowser);

// the other direction: every assertion below is worthless if the sheet
// never arrived, and a served sheet that 404s would read as "no change"
test("the spacing overrides actually reach the table", () => {
  for (const path of Object.keys(documents)) {
    const before = (plain[path] as Reading).letterSpacing;
    const after = (spaced[path] as Reading).letterSpacing;

    assert.strictEqual(before, "normal", `${path} started with ${before}`);
    assert.notStrictEqual(
      after,
      "normal",
      `${path} never picked the override up, so nothing below is measuring it`,
    );
  }
});

test("no list view reflows into horizontal scroll at 320px", () => {
  for (const path of Object.keys(documents)) {
    for (const [label, read] of [
      ["plain", plain[path] as Reading],
      ["spaced", spaced[path] as Reading],
    ] as const) {
      assert.ok(
        read.scrollWidth <= read.clientWidth,
        `${path} ${label} scrolls: ${read.scrollWidth} in a ${read.clientWidth} viewport`,
      );
    }
  }
});

// table-layout: fixed sizes a column off the viewport, never off its
// content, so wider text cannot move a column boundary. this is the
// property that keeps the criterion cheap to hold
test("the spacing overrides move no column boundary", () => {
  for (const path of Object.keys(documents)) {
    assert.deepStrictEqual(
      (spaced[path] as Reading).columns,
      (plain[path] as Reading).columns,
      `${path} re-laid its columns under the spacing overrides`,
    );
  }
});

test("the spacing overrides drop no row and shrink none", () => {
  for (const path of Object.keys(documents)) {
    const before = plain[path] as Reading;
    const after = spaced[path] as Reading;

    assert.strictEqual(after.rows, before.rows, `${path} lost rows`);

    const heights = new Map(
      before.cells.map((cell) => [cell.key, cell.height]),
    );
    for (const cell of after.cells) {
      const was = heights.get(cell.key);
      if (was === undefined) continue;

      assert.ok(
        cell.height >= was,
        `${path} shrank ${cell.key} from ${was} to ${cell.height}`,
      );
    }
  }
});

test("every cell's link holds 24x24 under the spacing overrides", () => {
  for (const path of Object.keys(documents)) {
    for (const cell of (spaced[path] as Reading).cells) {
      assert.ok(
        cell.width >= minTarget && cell.height >= minTarget,
        `${path} ${cell.key} lays out ${cell.width}x${cell.height}`,
      );
    }
  }
});

// the name column ellipses by design at this width — six of the tree's
// ten names already do with no overrides applied — so what the criterion
// asks is whether the full text survives somewhere, not whether it fits
test("a name the spacing overrides ellipse is still whole in the DOM", (t) => {
  for (const path of Object.keys(documents)) {
    const was = new Map(
      (plain[path] as Reading).cells.map((cell) => [cell.key, cell.ellipsed]),
    );

    const newly = (spaced[path] as Reading).cells.filter(
      (cell) => cell.ellipsed && was.get(cell.key) === false,
    );

    for (const cell of newly) {
      const text = cell.key.slice(cell.key.indexOf("|") + 1);
      assert.ok(
        text.length > 0,
        `${path} ellipsed ${cell.column} down to an empty accessible name`,
      );
    }

    const already = (plain[path] as Reading).cells.filter(
      (cell) => cell.ellipsed,
    ).length;

    t.diagnostic(
      `${path}: ${already} cell(s) ellipse with no overrides, ${newly.length} more under them`,
    );
  }
});

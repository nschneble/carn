// SPDX-License-Identifier: AGPL-3.0-or-later

// SC 1.4.12 at 320px, the width the criterion is written for. axe's own
// avoid-inline-spacing only looks for style attributes fighting a user
// sheet, and this stylesheet sets none, so nothing else measures what the
// four overrides do to a row table

import assert from "node:assert";
import { after, before, test } from "node:test";

import { shortShaChars } from "../../src/html/commit-log.js";
import { commitDocument, detail } from "../gallery/commit.js";
import { commits, logDocument } from "../gallery/commit-log.js";
import { branches, refsDocument } from "../gallery/refs.js";
import { indexDocument, populated } from "../gallery/repo-index.js";
import { files } from "../gallery/repo-show.js";
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

const lineHeightRatio = 1.5;
const wordSpacingRatio = 0.16;
const paragraphMargin = 2;

const reflowWidth = 320;
const minTarget = 24;

const documents: Record<string, string> = {
  "/tree": treeDocument(),
  "/refs": refsDocument(),
  "/index": indexDocument(),
  "/log": logDocument(),
  "/commit": commitDocument(),
};

// the fixture's own data, which is the only oracle for "whole in the DOM":
// textContent is CSS-independent, so comparing it to itself proves nothing
const names: Record<string, string[]> = {
  "/tree": files.map((entry) => entry.name),
  "/refs": branches.map((ref) => ref.name),
  "/index": populated.map((repo) => repo.name),
  "/log": commits(16).map((commit) => commit.sha.slice(0, shortShaChars)),
  "/commit": detail().files.map((file) => file.path),
};

type Cell = {
  key: string;
  column: string;
  text: string;
  width: number;
  height: number;
  clipped: boolean;
  ellipsed: boolean;
};

type Reading = {
  scrollWidth: number;
  clientWidth: number;
  fontSize: number;
  letterSpacing: string;
  lineHeight: string;
  wordSpacing: string;
  paragraphMargin: string;
  paragraphFontSize: number;
  rows: number;
  columns: number[];
  cells: Cell[];
  names: string[];
};

// read in the page: the boxes a user agent actually laid out, never a
// number this side computed from the markup
function readTable(): Reading {
  const root = document.documentElement;
  const body = document.querySelector(".tbl tbody") as HTMLElement | null;
  const paragraph = document.querySelector("p") as HTMLElement | null;
  const cells = [...document.querySelectorAll(".tbl tbody tr")].flatMap(
    (row, index) =>
      [...row.querySelectorAll("th, td")].flatMap((cell) => {
        const child = cell.firstElementChild as HTMLElement | null;
        if (child === null) return [];

        const box = child.getBoundingClientRect();
        const column = (cell.className.split(/\s+/)[0] ?? "").trim();

        return [
          {
            // the row index keeps two cells reading "1w" apart
            key: `${index}|${column}`,
            column,
            text: (child.textContent ?? "").trim(),
            width: box.width,
            height: box.height,
            clipped: child.scrollHeight > child.clientHeight + 1,
            // scrollWidth rounds up, so a whole pixel of slack is the floor
            // below which nothing is actually cut
            ellipsed: child.scrollWidth > Math.ceil(box.width) + 1,
          },
        ];
      }),
  );

  const header = [...document.querySelectorAll(".tbl thead th")];
  const read = body === null ? null : getComputedStyle(body);

  return {
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    fontSize: read === null ? 0 : Number.parseFloat(read.fontSize),
    letterSpacing: read === null ? "" : read.letterSpacing,
    lineHeight: read === null ? "" : read.lineHeight,
    wordSpacing: read === null ? "" : read.wordSpacing,
    paragraphMargin:
      paragraph === null ? "" : getComputedStyle(paragraph).marginBottom,
    paragraphFontSize:
      paragraph === null
        ? 0
        : Number.parseFloat(getComputedStyle(paragraph).fontSize),
    rows: document.querySelectorAll(".tbl tbody tr").length,
    columns: header.map((cell) =>
      Math.round(cell.getBoundingClientRect().width),
    ),
    cells,
    names: cells
      .filter((cell) => cell.column === "nm")
      .map((cell) => cell.text),
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
// never arrived, and a served sheet that 404s would read as "no change".
// all four declarations are pinned, so deleting any one of them fails here
test("the spacing overrides actually reach the table", () => {
  for (const path of Object.keys(documents)) {
    const before = plain[path] as Reading;
    const after = spaced[path] as Reading;

    assert.strictEqual(
      before.letterSpacing,
      "normal",
      `${path} started with ${before.letterSpacing}`,
    );
    assert.notStrictEqual(
      after.letterSpacing,
      "normal",
      `${path} never picked the override up, so nothing below is measuring it`,
    );

    assert.strictEqual(
      Number.parseFloat(before.wordSpacing),
      0,
      `${path} started with word-spacing ${before.wordSpacing}`,
    );
    assert.strictEqual(
      Number.parseFloat(after.wordSpacing).toFixed(2),
      (wordSpacingRatio * after.fontSize).toFixed(2),
      `${path} reads word-spacing ${after.wordSpacing} on a ${after.fontSize}px cell`,
    );

    assert.notStrictEqual(
      after.lineHeight,
      before.lineHeight,
      `${path} reads the same line-height either way, so the override pins nothing`,
    );
    assert.strictEqual(
      Number.parseFloat(after.lineHeight).toFixed(2),
      (lineHeightRatio * after.fontSize).toFixed(2),
      `${path} reads line-height ${after.lineHeight} on a ${after.fontSize}px cell`,
    );

    // no table carries a paragraph, so the fourth declaration is pinned on
    // the page around it or it is pinned nowhere at all
    assert.ok(
      before.paragraphFontSize > 0,
      `${path} renders no paragraph, so the margin override reaches nothing`,
    );
    assert.strictEqual(
      Number.parseFloat(after.paragraphMargin).toFixed(2),
      (paragraphMargin * after.paragraphFontSize).toFixed(2),
      `${path} reads a ${after.paragraphMargin} bottom margin on its paragraph`,
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

// the row count and the clipping are what the 24px floor cannot answer for:
// a taller line box inside a box that did not grow is content lost
test("the spacing overrides drop no row and clip no cell", () => {
  for (const path of Object.keys(documents)) {
    const before = plain[path] as Reading;
    const after = spaced[path] as Reading;

    assert.strictEqual(after.rows, before.rows, `${path} lost rows`);

    for (const cell of after.cells) {
      assert.ok(
        !cell.clipped,
        `${path} clips ${cell.key} vertically under the spacing overrides`,
      );
    }
  }
});

// on the tree and the index the third cell holds a <time>, not a link, and
// the row's own overlay is the target there; the box is measured either way
test("every cell's own box holds 24x24 under the spacing overrides", () => {
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
    const wanted = names[path] as string[];
    const read = (spaced[path] as Reading).names;

    assert.strictEqual(
      read.length,
      wanted.length,
      `${path} rendered ${read.length} name cells for ${wanted.length} fixture rows`,
    );

    for (const [index, name] of wanted.entries()) {
      const rendered = read[index] as string;

      assert.ok(
        rendered.startsWith(name),
        `${path} row ${index} reads "${rendered}", not the fixture's "${name}"`,
      );
    }

    const already = (plain[path] as Reading).cells.filter(
      (cell) => cell.ellipsed,
    ).length;
    const newly = (spaced[path] as Reading).cells.filter(
      (cell) => cell.ellipsed,
    ).length;

    t.diagnostic(
      `${path}: ${wanted.length} names whole, ${already} cell(s) ellipse with no overrides and ${newly} under them`,
    );
  }
});

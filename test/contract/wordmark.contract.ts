// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { type Browser, chromium } from "playwright";

import { wordmark } from "../../src/repos/wordmark.js";
import { renderPaths } from "../support/render-paths.js";

const root = resolve(import.meta.dirname, "../../..");
const bounded = { timeout: 60_000 };

const names = [
  "carn",
  "linklater",
  "gelatinous-cube",
  "a-very-long-repo-name",
  "wwwwwwwwwwwwwwwwwwwwwwww",
  "iiiiiiiiiiiiiiiiiiiiiiii",
  "MMMM",
  "x",
  "0123456789",
  "under_score.dotted-name",
  "A".repeat(40),
];

const face = readFileSync(join(root, "fonts/carn-sans.woff2")).toString(
  "base64",
);

let browser: Browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
});

function page(marks: string[]): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Marks</title><style>
@font-face {
  font-family: "Carn Sans";
  src: url(data:font/woff2;base64,${face}) format("woff2-variations");
  font-weight: 400 900;
  font-stretch: 100% 125%;
}
:root { --accent: #ff4d95; --ink: #f2f4f4; }
svg { font-family: "Carn Sans"; width: 600px; display: block; }
</style></head><body>${marks.join("")}</body></html>`;
}

function viewBox(mark: string): { width: number; height: number } {
  const found = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(mark);
  assert.ok(found, `no viewBox in ${mark.slice(0, 120)}`);
  return { width: Number(found[1]), height: Number(found[2]) };
}

test("the same name always renders the same mark", () => {
  for (const name of names) {
    assert.strictEqual(wordmark(name).value, wordmark(name).value, name);
  }
});

test("different names render different marks", () => {
  const seen = new Map<string, string>();

  for (const name of names) {
    const mark = wordmark(name).value;
    const clash = seen.get(mark);
    assert.strictEqual(
      clash,
      undefined,
      `${name} renders the same as ${clash}`,
    );
    seen.set(mark, name);
  }
});

test("the palette is two colours and the ground", () => {
  for (const name of names) {
    const mark = wordmark(name).value;
    const hues = new Set(mark.match(/var\(--[a-z-]+\)/g) ?? []);

    assert.deepStrictEqual(
      [...hues].sort(),
      ["var(--accent)", "var(--ink)"],
      `${name} draws outside accent and ink`,
    );
    assert.doesNotMatch(mark, /(?:fill|stroke)="(?!var\(|none")/, name);
  }
});

test("nothing forbidden is emitted", () => {
  for (const name of names) {
    const mark = wordmark(name).value;

    for (const banned of [
      "Gradient",
      "filter",
      "feDropShadow",
      "feGaussianBlur",
      "skewX",
      "skewY",
      "pattern",
      "image",
    ]) {
      assert.ok(!mark.includes(banned), `${name} emits ${banned}`);
    }
  }
});

test("a long name with a separator breaks onto a second line", () => {
  const lines = (name: string) =>
    (wordmark(name).value.match(/<text /g) ?? []).length;

  assert.strictEqual(lines("gelatinous-cube"), 1);
  assert.strictEqual(lines("a-very-long-repo-name"), 2);
  assert.strictEqual(lines("under_score.dotted-name"), 2);
  assert.strictEqual(lines("wwwwwwwwwwwwwwwwwwwwwwww"), 1);
});

test("the mark carries no accessible name of its own", () => {
  const mark = wordmark("linklater").value;

  assert.match(mark, /aria-hidden="true"/);
  assert.match(mark, /focusable="false"/);
});

test("a repo name is escaped into the mark", () => {
  const mark = wordmark('a"><script>').value;

  assert.ok(!mark.includes("<script"), mark);
  assert.match(mark, /<tspan y="[-\d.]+">&lt;<\/tspan>/);
  assert.match(mark, /<tspan y="[-\d.]+">&gt;<\/tspan>/);
  assert.match(mark, /<tspan y="[-\d.]+">&quot;<\/tspan>/);
});

test("the rendered mark never leaves its viewBox", bounded, async () => {
  const context = await browser.newContext();
  const sheet = await context.newPage();
  const failures: string[] = [];

  for (const path of renderPaths) {
    await sheet.emulateMedia({ colorScheme: path.colorScheme });
    await sheet.setContent(page(names.map((name) => wordmark(name).value)));
    await sheet.evaluate(() => document.fonts.ready);

    const boxes = await sheet.evaluate(() =>
      Array.from(document.querySelectorAll("svg"), (node) => {
        const box = (node as SVGSVGElement).getBBox();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    );

    assert.strictEqual(boxes.length, names.length);

    boxes.forEach((box, index) => {
      const name = names[index] ?? "";
      const frame = viewBox(wordmark(name).value);
      const slack = 0.5;

      if (
        box.x < -slack ||
        box.y < -slack ||
        box.x + box.width > frame.width + slack ||
        box.y + box.height > frame.height + slack
      ) {
        failures.push(
          `${path.name} ${name}: ink ${JSON.stringify(box)} outside 0 0 ${frame.width} ${frame.height}`,
        );
      }
    });
  }

  assert.deepStrictEqual(failures, []);
  await context.close();
});

test("the viewBox is fitted to the mark, not padded", bounded, async () => {
  const context = await browser.newContext();
  const sheet = await context.newPage();

  await sheet.setContent(page(names.map((name) => wordmark(name).value)));
  await sheet.evaluate(() => document.fonts.ready);

  const boxes = await sheet.evaluate(() =>
    Array.from(document.querySelectorAll("svg"), (node) => {
      const box = (node as SVGSVGElement).getBBox();
      return { width: box.width, height: box.height };
    }),
  );

  const slack = boxes.map((box, index) => {
    const frame = viewBox(wordmark(names[index] ?? "").value);
    return {
      name: names[index],
      width: box.width / frame.width,
      height: box.height / frame.height,
    };
  });

  const loosest = slack.reduce((worst, entry) =>
    Math.min(entry.width, entry.height) < Math.min(worst.width, worst.height)
      ? entry
      : worst,
  );

  assert.ok(
    Math.min(loosest.width, loosest.height) > 0.7,
    `${loosest.name} fills only ${JSON.stringify(loosest)} of its viewBox`,
  );
  await context.close();
});

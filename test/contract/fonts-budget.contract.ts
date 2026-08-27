// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const readme = readFileSync(join(root, "fonts", "README.md"), "utf8");

const budget = 100 * 1024;
const sans = "carn-sans.woff2";
const mono = ["carn-mono-400.woff2", "carn-mono-500.woff2"];

function shipped(...files: string[]): number {
  return files.reduce(
    (total, file) => total + statSync(join(root, "fonts", file)).size,
    0,
  );
}

function stated(what: string, pattern: RegExp): number[] {
  const found = readme.match(pattern);
  assert.ok(found, `fonts/README.md no longer states ${what}`);
  return found.slice(1).map((figure) => Number(figure.replace(/,/g, "")));
}

test("the README states the size of every font it ships", () => {
  assert.deepStrictEqual(
    stated("the sans size", /\*\*([\d,]+) B\*\*, \d+ glyphs of the upstream/),
    [shipped(sans)],
  );

  assert.deepStrictEqual(
    stated(
      "the two mono sizes",
      /\*\*([\d,]+) B\*\* at 400 and \*\*([\d,]+) B\*\* at 500/,
    ),
    mono.map((file) => shipped(file)),
  );
});

test("the licence note's subset figure is the mono pair as shipped", () => {
  const [, subset] = stated(
    "the subset comparison",
    /costs ([\d,]+) B for the pair against ([\d,]+) B subset/,
  );

  assert.strictEqual(subset, shipped(...mono));
});

test("the licence note's total is the unsubset pair plus the sans as shipped", () => {
  const [unsubset] = stated(
    "the subset comparison",
    /costs ([\d,]+) B for the pair against [\d,]+ B subset/,
  );
  const [total] = stated(
    "the over-budget total",
    /With the sans face that is ([\d,]+) B/,
  );

  assert.strictEqual(total, unsubset + shipped(sans));
});

test("the fonts alone leave room for a page, the name-preserving route does not", () => {
  assert.ok(
    shipped(sans, ...mono) < budget,
    "the shipped fonts no longer leave room for a page",
  );

  const [total] = stated(
    "the over-budget total",
    /With the sans face that is ([\d,]+) B/,
  );
  assert.ok(
    total > budget,
    "the rejected route now fits, so the note is wrong",
  );
});

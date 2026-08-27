// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { tokens } from "../../src/html/styles.js";

const root = resolve(import.meta.dirname, "../../..");

export const brand = readFileSync(join(root, "docs/BRAND.md"), "utf8");

export function fences(document: string): string[] {
  return [...document.matchAll(/```css\n([\s\S]*?)\n```/g)].map(
    (match) => match[1] as string,
  );
}

export function declarations(
  css: string,
  selector: string,
): Map<string, string> {
  const opener = new RegExp(
    `^[ ]*${selector.replaceAll(/[[\](){}.*+?^$|\\]/g, "\\$&")} \\{$`,
    "gm",
  );
  const openings = [...css.matchAll(opener)];
  assert.strictEqual(openings.length, 1, `${selector} is not declared once`);

  const opening = openings[0] as RegExpExecArray;
  const start = (opening.index as number) + opening[0].length;
  const end = css.indexOf("}", start);
  assert.notStrictEqual(end, -1, `${selector} is unterminated`);

  const found = new Map<string, string>();
  for (const line of css.slice(start, end).split("\n")) {
    const match = line.match(
      /^\s*(--[a-z0-9-]+):\s*([^;]+);(?:\s*\/\*[^*]*\*\/)?\s*$/,
    );
    if (match) found.set(match[1] as string, match[2] as string);
  }
  return found;
}

export function resolvePalette(
  overrides: Map<string, string>,
): Map<string, string> {
  const merged = new Map([...declarations(tokens, ":root"), ...overrides]);

  for (const [name, value] of merged) {
    const reference = value.match(/^var\((--[a-z0-9-]+)\)$/);
    if (!reference) continue;
    const target = merged.get(reference[1] as string);
    assert.ok(target, `${name} points at undeclared ${reference[1]}`);
    merged.set(name, target);
  }
  return merged;
}

const [tokenFence] = fences(brand);
assert.ok(tokenFence, "BRAND.md has no token fence");

export const brandTokens = tokenFence;

export const dark = resolvePalette(new Map());
export const light = resolvePalette(
  declarations(tokens, ':root[data-theme="light"]'),
);
export const palettes = [
  ["dark", dark],
  ["light", light],
] as const;

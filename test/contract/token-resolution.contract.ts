// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { after, test } from "node:test";
import { galleryDocument } from "../gallery/document.js";
import {
  type BrowserDocument,
  browser,
  closeBrowser,
} from "../support/browser.js";
import { renderPaths } from "../support/render-paths.js";
import { brandTokens, dark, light } from "../support/tokens.js";

declare const document: BrowserDocument;
declare function getComputedStyle(element: object): {
  getPropertyValue(name: string): string;
};

const names = [
  ...new Set(
    [...brandTokens.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(
      (match) => match[1] as string,
    ),
  ),
];
const colours = names.filter((name) => !/^--(f-|s[1-9]$|measure$)/.test(name));

after(closeBrowser);

async function resolveTokens(
  markup: string,
  colorScheme: "light" | "dark",
): Promise<Map<string, string>> {
  const page = await (await browser()).newPage();

  try {
    await page.emulateMedia({ colorScheme });
    await page.setContent(markup);

    const read = await page.evaluate((wanted) => {
      const computed = getComputedStyle(document.documentElement);
      return wanted.map(
        (name) => [name, computed.getPropertyValue(name).trim()] as const,
      );
    }, names);

    return new Map(read);
  } finally {
    await page.close();
  }
}

test("the two render paths are the ones every gate iterates", () => {
  assert.deepStrictEqual(
    renderPaths.map((path) => [path.name, path.colorScheme, path.palette]),
    [
      ["colorScheme light", "light", "light"],
      ["colorScheme dark", "dark", "dark"],
    ],
    "render-paths.ts is a shared support module: dropping an entry shrinks this file and axe.contract.ts at once, and every test in both still passes",
  );
});

test("the enumeration names every token the palettes resolve", () => {
  for (const name of dark.keys()) {
    assert.ok(
      names.includes(name),
      `${name} resolves, but no line of BRAND.md's token block names it, so nothing below would notice it vanishing`,
    );
  }
});

for (const path of renderPaths) {
  test(`the gallery resolves every token under ${path.name}`, async () => {
    const resolved = await resolveTokens(galleryDocument(), path.colorScheme);

    for (const name of names) {
      assert.ok(
        resolved.get(name),
        `${name} is empty, so everything reading it silently falls back to inherit`,
      );
    }

    const expected = path.palette === "dark" ? dark : light;
    for (const name of colours) {
      assert.strictEqual(resolved.get(name), expected.get(name), name);
    }
  });
}

test("a token dropped from the bare :root empties in exactly the dark paths", async () => {
  const declaration = "  --ink-mid: #8e9494;\n";
  const markup = galleryDocument();
  const emptied: string[] = [];

  assert.strictEqual(
    markup.split(declaration).length,
    2,
    "the dark --ink-mid declaration is no longer unique, so the control deletes the wrong thing or nothing",
  );

  for (const path of renderPaths) {
    const resolved = await resolveTokens(
      markup.replace(declaration, ""),
      path.colorScheme,
    );
    if (resolved.get("--ink-mid") === "") emptied.push(path.name);
  }

  assert.deepStrictEqual(
    emptied,
    renderPaths
      .filter((candidate) => candidate.palette === "dark")
      .map(({ name }) => name),
    "a token left only inside a media query must vanish wherever that query does not match",
  );
});

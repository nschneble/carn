// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { chromium } from "playwright";

import { buildApp } from "../../src/app.js";
import { minifyCss } from "../../src/html/minify-css.js";
import { styleHref, stylesheet } from "../../src/html/styles.js";
import { servedStylesheet } from "../../src/html/wire-weight.js";

const root = resolve(import.meta.dirname, "../../..");
const faces = ["carn-sans.woff2", "carn-mono-400.woff2", "carn-mono-500.woff2"];

// boolean determines if it counts against the page budget; only favicon is
// loaded by a browser, so we choose the largest to compare against
const images: Record<string, boolean> = {
  "apple-touch-icon.png": false,
  "favicon.ico": false,
  "favicon.png": true,
  "preview.jpg": false,
};

test("the stylesheet route serves the sheet at its own hashed path", async () => {
  const app = buildApp();
  const hit = await app.inject({ method: "GET", url: styleHref });
  const stale = await app.inject({ method: "GET", url: "/carn.css" });
  await app.close();

  assert.strictEqual(hit.statusCode, 200);
  assert.strictEqual(
    hit.body,
    servedStylesheet,
    "the route serves something other than the minified sheet",
  );
  assert.notStrictEqual(
    hit.body,
    stylesheet,
    "the route serves the source sheet, so the budget pays for whitespace",
  );
  assert.match(String(hit.headers["content-type"]), /^text\/css/);
  assert.strictEqual(
    hit.headers["cache-control"],
    "public, max-age=31536000, immutable",
  );
  assert.strictEqual(
    stale.statusCode,
    404,
    "an unhashed path answers too, so a token edit would ship behind a year of immutable caching",
  );
});

// BRAND.md's token block is pinned byte-identical to styles.ts, so the
// source sheet stays readable and only what goes over the wire is squeezed
test("minifying is a serve-time transform that changes no rule", () => {
  const tidy = (css: string) =>
    css
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/\s+/g, " ")
      .replaceAll(/\s*([{}:;,])\s*/g, "$1")
      .replaceAll(";}", "}")
      .trim();

  assert.strictEqual(servedStylesheet, minifyCss(stylesheet));
  assert.strictEqual(
    tidy(servedStylesheet),
    tidy(stylesheet),
    "minifying dropped or reordered something that is not whitespace or a comment",
  );
  assert.ok(
    servedStylesheet.length < stylesheet.length * 0.9,
    `minifying saved only ${stylesheet.length - servedStylesheet.length} B of ${stylesheet.length}`,
  );
  assert.doesNotMatch(servedStylesheet, /\/\*/);
  assert.ok(
    servedStylesheet.includes('"Helvetica Neue"'),
    "a quoted family lost the space inside it, so the minifier is not string-aware",
  );
});

// the string comparison above cannot tell a valid sheet from a mangled
// one; a real parser can, and it is the parser that will serve visitors
test("a browser parses the served sheet to the same rules as the source", async () => {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    const parse = (css: string) =>
      page.evaluate((text: string) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(text);
        const found: string[] = [];
        const walk = (list: CSSRuleList) => {
          for (const rule of list) {
            found.push(rule.cssText.replaceAll(", ", ","));
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) walk(nested);
          }
        };
        walk(sheet.cssRules);
        return found;
      }, css);

    const before = await parse(stylesheet);
    const after = await parse(servedStylesheet);

    assert.ok(before.length > 50, "the source sheet parsed to almost nothing");
    assert.deepStrictEqual(
      after,
      before,
      "the served sheet parses to different rules than the source it came from",
    );
  } finally {
    await browser.close();
  }
});

test("every face the stylesheet asks for is a route that answers", async () => {
  const app = buildApp();

  for (const face of faces) {
    assert.ok(
      servedStylesheet.includes(`url("/fonts/${face}")`),
      `the served stylesheet no longer asks for ${face}`,
    );

    const response = await app.inject({
      method: "GET",
      url: `/fonts/${face}`,
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers["content-type"], "font/woff2");
    assert.deepStrictEqual(
      response.rawPayload,
      readFileSync(join(root, "fonts", face)),
      `${face} is not served byte-for-byte`,
    );
  }

  await app.close();
});

test("a font's ETag is honored, so the header is not decoration", async () => {
  const app = buildApp();
  const first = await app.inject({
    method: "GET",
    url: "/fonts/carn-sans.woff2",
  });
  const tag = first.headers.etag;
  assert.ok(tag, "the font carries no ETag");

  const repeat = await app.inject({
    method: "GET",
    url: "/fonts/carn-sans.woff2",
    headers: { "if-none-match": String(tag) },
  });
  const changed = await app.inject({
    method: "GET",
    url: "/fonts/carn-sans.woff2",
    headers: { "if-none-match": '"0000000000000000"' },
  });
  await app.close();

  assert.strictEqual(repeat.statusCode, 304);
  assert.strictEqual(repeat.rawPayload.length, 0);
  assert.strictEqual(repeat.headers.etag, tag);
  assert.strictEqual(changed.statusCode, 200);
  assert.strictEqual(changed.rawPayload.length, first.rawPayload.length);
});

test("a font outside the three refuses without touching the disk", async () => {
  const app = buildApp();

  for (const name of [
    "nope.woff2",
    "..%2f..%2fpackage.json",
    "carn-sans.woff2.map",
  ]) {
    const response = await app.inject({
      method: "GET",
      url: `/fonts/${name}`,
    });

    assert.strictEqual(response.statusCode, 404, name);
    assert.doesNotMatch(response.body, /nschneble|\/Users|ENOENT/);
  }

  await app.close();
});

test("an image's ETag is honored, so the header is not decoration", async () => {
  const app = buildApp();
  const first = await app.inject({
    method: "GET",
    url: "/images/favicon.png",
  });
  const tag = first.headers.etag;
  assert.ok(tag, "the image carries no ETag");

  const repeat = await app.inject({
    method: "GET",
    url: "/images/favicon.png",
    headers: { "if-none-match": String(tag) },
  });
  const changed = await app.inject({
    method: "GET",
    url: "/images/favicon.png",
    headers: { "if-none-match": '"0000000000000000"' },
  });
  await app.close();

  assert.strictEqual(repeat.statusCode, 304);
  assert.strictEqual(repeat.rawPayload.length, 0);
  assert.strictEqual(repeat.headers.etag, tag);
  assert.strictEqual(changed.statusCode, 200);
  assert.strictEqual(changed.rawPayload.length, first.rawPayload.length);
});

test("an image outside the five refuses without touching the disk", async () => {
  const app = buildApp();

  for (const name of ["nope.png", "..%2f..%2fpackage.json", "favicon.gif"]) {
    const response = await app.inject({
      method: "GET",
      url: `/images/${name}`,
    });

    assert.strictEqual(response.statusCode, 404, name);
    assert.doesNotMatch(response.body, /nschneble|\/Users|ENOENT/);
  }

  await app.close();
});

test("the whole page fits the budget with both families, images, and the sheet", async () => {
  const app = buildApp();
  const sheet = await app.inject({ method: "GET", url: styleHref });
  await app.close();

  const shippedFaces = faces.reduce(
    (total, face) => total + readFileSync(join(root, "fonts", face)).length,
    sheet.rawPayload.length,
  );
  const shippedImages = Object.entries(images).reduce(
    (total, [name, counts]) =>
      counts ? total + readFileSync(join(root, "images", name)).length : total,
    sheet.rawPayload.length,
  );

  assert.ok(
    shippedFaces + shippedImages < 100 * 1024,
    `the stylesheet, images, and both families come to ${shippedFaces + shippedImages} B, which leaves no room for a page under the 100 KB budget`,
  );
});

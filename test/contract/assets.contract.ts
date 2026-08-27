// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { buildApp } from "../../src/app.js";
import { styleHref, stylesheet } from "../../src/html/styles.js";

const root = resolve(import.meta.dirname, "../../..");
const faces = ["carn-sans.woff2", "carn-mono-400.woff2", "carn-mono-500.woff2"];

test("the stylesheet route serves the sheet at its own hashed path", async () => {
  const app = buildApp();
  const hit = await app.inject({ method: "GET", url: styleHref });
  const stale = await app.inject({ method: "GET", url: "/carn.css" });
  await app.close();

  assert.strictEqual(hit.statusCode, 200);
  assert.strictEqual(hit.body, stylesheet);
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

test("every face the stylesheet asks for is a route that answers", async () => {
  const app = buildApp();

  for (const face of faces) {
    assert.ok(
      stylesheet.includes(`url("/fonts/${face}")`),
      `the stylesheet no longer asks for ${face}`,
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

test("a font's ETag is honoured, so the header is not decoration", async () => {
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

test("the whole page fits the budget with both families and the sheet", async () => {
  const app = buildApp();
  const sheet = await app.inject({ method: "GET", url: styleHref });
  await app.close();

  const shipped = faces.reduce(
    (total, face) => total + readFileSync(join(root, "fonts", face)).length,
    sheet.rawPayload.length,
  );

  assert.ok(
    shipped < 100 * 1024,
    `the stylesheet and both families come to ${shipped} B, which leaves no room for a page under the 100 KB budget`,
  );
});

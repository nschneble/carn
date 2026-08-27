// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";
import { readTheme } from "../../src/html/theme.js";
import { galleryDocument } from "../gallery/document.js";

function openingTag(document: string): string {
  const match = document.match(/<html[^>]*>/);
  assert.ok(match, "the gallery has no opening html tag");
  return match[0];
}

test("the cookie picks a theme in both directions", () => {
  assert.strictEqual(readTheme("theme=dark"), "dark");
  assert.strictEqual(readTheme("theme=light"), "light");
  assert.strictEqual(readTheme("id=7; theme=light; seen=1"), "light");
  assert.strictEqual(readTheme(" theme = dark "), "dark");
});

test("anything that is not a theme leaves the OS to decide", () => {
  assert.strictEqual(readTheme(undefined), null);
  assert.strictEqual(readTheme(""), null);
  assert.strictEqual(readTheme("theme"), null);
  assert.strictEqual(readTheme("theme="), null);
  assert.strictEqual(readTheme("theme=sepia"), null);
  assert.strictEqual(readTheme("theme=DARK"), null);
  assert.strictEqual(readTheme("mytheme=dark"), null);
  assert.strictEqual(readTheme("THEME=dark"), null);
});

test("the first theme cookie wins", () => {
  assert.strictEqual(readTheme("theme=dark; theme=light"), "dark");
});

test("each theme state stamps the document it is meant to", () => {
  assert.match(galleryDocument("dark"), /<html lang="en" data-theme="dark">/);
  assert.match(galleryDocument("light"), /<html lang="en" data-theme="light">/);
  assert.match(galleryDocument(null), /<html lang="en">\n/);
  assert.doesNotMatch(openingTag(galleryDocument(null)), /data-theme/);
});

test("the gallery exercises every primitive and every state", () => {
  const document = galleryDocument("dark");

  for (const primitive of [
    'class="btn"',
    'class="btn btn--ghost"',
    'class="btn btn--block"',
    'aria-disabled="true"',
    'aria-describedby="merge-reason"',
    'class="chip"',
    'class="chip chip--current"',
    'class="row is-dir"',
    'class="row is-dir is-hover"',
    'class="nm t-item" lang="en"',
    'class="msg"',
    'class="age"',
    'class="box"',
    'class="box box--area"',
    'class="hint"',
    'class="tag"',
    'class="tag tag--quiet"',
    'class="meta"',
    "<dt>",
    "<dd>",
    'class="skip"',
    'class="vh"',
    'id="main" tabindex="-1"',
    'class="sc"',
    'aria-hidden="true"',
  ]) {
    assert.ok(
      document.includes(primitive),
      `the gallery is missing ${primitive}`,
    );
  }

  for (const role of [
    "t-xl",
    "t-l",
    "t-m",
    "t-item",
    "t-body",
    "t-label",
    "t-micro",
    "t-mono",
  ]) {
    assert.match(
      document,
      new RegExp(`class="(?:[^"]+ )?${role}(?: [^"]+)?"`),
      `the gallery is missing .${role}`,
    );
  }
});

test("a directory's trailing slash is real text, and small caps are unspaced", () => {
  const document = galleryDocument("dark");

  assert.ok(document.includes('<span class="sc">docs</span>/</a>'));
  assert.doesNotMatch(document, /content:\s*"\//);
  assert.doesNotMatch(document, /<\/span>\s*\n\s*<span class="sc">/);
  assert.doesNotMatch(document, /<span class="sc"[^>]*aria-label/);
});

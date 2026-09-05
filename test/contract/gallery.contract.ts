// SPDX-License-Identifier: AGPL-3.0-or-later

// the axe suite audits the gallery, so a primitive missing from the
// gallery is a primitive nothing audits

import assert from "node:assert";
import { test } from "node:test";

import { galleryDocument } from "../gallery/document.js";

test("the gallery exercises every primitive and every state", () => {
  const document = galleryDocument();

  for (const primitive of [
    'class="btn"',
    'class="btn btn--ghost"',
    'class="btn btn--block"',
    'aria-disabled="true"',
    'aria-describedby="merge-reason"',
    'class="chip"',
    'class="chip chip--current"',
    'class="tbl tree"',
    '<caption class="vh">Files</caption>',
    'class="row is-dir"',
    'class="row is-dir is-hover"',
    'class="nm" scope="row"',
    'class="t-item" lang="en"',
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
    'class="caps"',
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
  const document = galleryDocument();

  assert.ok(document.includes('<span class="caps">docs</span>/</a>'));
  assert.doesNotMatch(document, /content:\s*"\//);
  assert.doesNotMatch(document, /\s<span class="sc">/);
  assert.doesNotMatch(document, /<span class="sc"[^>]*aria-label/);
});

// the linked mode is what the axe suite serves; the inline mode is what
// `npm run gallery` writes for a browser to open from the filesystem
test("the gallery carries its stylesheet exactly one way at a time", () => {
  const inline = galleryDocument();
  const linked = galleryDocument("/gallery.css");

  assert.match(inline, /<style>\n@font-face \{/);
  assert.ok(inline.includes("\n:root {\n  color-scheme: dark;"));
  assert.doesNotMatch(inline, /<link rel="stylesheet"/);

  assert.match(linked, /<link rel="stylesheet" href="\/gallery\.css" \/>/);
  assert.doesNotMatch(linked, /<style[ >]/);
});

// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import { html, raw } from "../../src/html/index.js";

test("a script payload cannot open a tag", () => {
  const out = html`<p>${"<script>alert(1)</script>"}</p>`.value;

  assert.ok(!out.includes("<script"));
  assert.strictEqual(out, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
});

test("an ampersand is encoded once, alongside other entities", () => {
  const out = html`${"fish & <chips>"}`.value;

  assert.strictEqual(out, "fish &amp; &lt;chips&gt;");
  assert.strictEqual(out.split("amp;").length - 1, 1);
});

test("raw passes its value through unescaped", () => {
  assert.strictEqual(html`${raw("<b>x</b>")}`.value, "<b>x</b>");
});

test("a nested html result is not escaped again", () => {
  const inner = html`<b>${"x&y"}</b>`;

  assert.strictEqual(html`<p>${inner}</p>`.value, "<p><b>x&amp;y</b></p>");
});

test("arrays join without a separator and escape each element", () => {
  assert.strictEqual(html`${["a", "b"]}`.value, "ab");
  assert.strictEqual(html`[${[]}]`.value, "[]");
  assert.strictEqual(html`${["<a>", "&"]}`.value, "&lt;a&gt;&amp;");
});

test("null, undefined and booleans render as nothing", () => {
  assert.strictEqual(html`[${null}]`.value, "[]");
  assert.strictEqual(html`[${undefined}]`.value, "[]");
  assert.strictEqual(html`[${false}]`.value, "[]");
  assert.strictEqual(html`[${true}]`.value, "[]");
});

test("an attribute value cannot break out of its quotes", () => {
  const double = html`<a href="${'" onmouseover="alert(1)'}"></a>`.value;
  const single = html`<a href='${"' onmouseover='alert(1)"}'></a>`.value;

  assert.strictEqual(
    double,
    '<a href="&quot; onmouseover=&quot;alert(1)"></a>',
  );
  assert.strictEqual(double.split('"').length - 1, 2);
  assert.strictEqual(single, "<a href='&#39; onmouseover=&#39;alert(1)'></a>");
  assert.strictEqual(single.split("'").length - 1, 2);
});

test("an object is stringified and then escaped", () => {
  const withToString = { toString: () => "<b>x</b>" };

  assert.strictEqual(html`${withToString}`.value, "&lt;b&gt;x&lt;/b&gt;");
  assert.strictEqual(
    html`${new Error("<script>alert(1)</script>")}`.value,
    "Error: &lt;script&gt;alert(1)&lt;/script&gt;",
  );
});

test("numbers and bigints interpolate as their digits", () => {
  assert.strictEqual(html`[${42}]`.value, "[42]");
  assert.strictEqual(html`[${-5}]`.value, "[-5]");
  assert.strictEqual(html`[${10n}]`.value, "[10]");
  assert.strictEqual(html`[${0}]`.value, "[0]");
});

test("an invalid escape sequence is refused, not rendered", () => {
  const firstChunk = (strings: TemplateStringsArray): unknown => strings[0];

  assert.strictEqual(firstChunk`a\uZZb`, undefined);
  assert.throws(() => html`a\uZZb${1}c`, /invalid escape sequence/);
  assert.throws(() => html`ok${1}then\x2y`, /chunk 1 has an invalid escape/);
});

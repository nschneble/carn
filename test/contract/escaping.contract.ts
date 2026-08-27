// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import { html, raw } from "../../src/html/index.js";
import type { Position } from "../../src/html/position.js";

const unescaped = raw;

function chunks(...parts: string[]): TemplateStringsArray {
  return Object.assign([...parts], { raw: [...parts] });
}

const attributeSites: [Position, string, string][] = [
  ["doubleQuoted", '<a title="', '">t</a>'],
  ["singleQuoted", "<a title='", "'>t</a>"],
  ["beforeAttrValue", "<a title=", ">t</a>"],
  ["unquoted", "<a title=r-", ">t</a>"],
  ["beforeAttrName", "<a ", ">t</a>"],
  ["attrName", "<a data-", '="y">t</a>'],
  ["tagName", "<", ">t</a>"],
];

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

test("all five escaped characters survive every quoted position", () => {
  const payload = "&<>\"'";
  const escaped = "&amp;&lt;&gt;&quot;&#39;";

  assert.strictEqual(html`<p>${payload}</p>`.value, `<p>${escaped}</p>`);
  assert.strictEqual(
    html`<a title="${payload}"></a>`.value,
    `<a title="${escaped}"></a>`,
  );
  assert.strictEqual(
    html`<a title='${payload}'></a>`.value,
    `<a title='${escaped}'></a>`,
  );
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

test("a raw value renders in text position and nowhere else", () => {
  assert.strictEqual(
    html`<p>${unescaped("<b>x</b>")}</p>`.value,
    "<p><b>x</b></p>",
  );
  assert.strictEqual(
    html(chunks("<p>", "</p>"), unescaped("<b>x</b>")).value,
    "<p><b>x</b></p>",
  );

  for (const [position, before, after] of attributeSites) {
    assert.throws(
      () => html(chunks(before, after), unescaped("<b>x</b>")),
      new RegExp(`raw value in ${position} position`),
      `${before}\${raw}${after}`,
    );
  }
});

test("a raw value is refused however it reaches the interpolation", () => {
  const value = unescaped("<b>x</b>");
  const aliased = unescaped;

  function wrapper(source: string) {
    return unescaped(source);
  }

  const shapes: [string, unknown][] = [
    ["direct", unescaped("<b>x</b>")],
    ["intermediate const", value],
    ["aliased function", aliased("<b>x</b>")],
    ["point-free map", ["<b>x</b>"].map(aliased)],
    ["wrapper component", wrapper("<b>x</b>")],
    ["nested html result", html`<b>${"x"}</b>`],
    ["array member", ["a", value]],
  ];

  for (const [shape, carried] of shapes) {
    assert.throws(
      () => html`<a title="${carried}">t</a>`,
      /raw value in doubleQuoted position/,
      shape,
    );
    assert.doesNotThrow(() => html`<p>${carried}</p>`, shape);
  }
});

test("the classification is memoised without changing what it decides", () => {
  const render = (value: unknown) => html`<a title="${value}">t</a>`.value;

  assert.strictEqual(render("a"), '<a title="a">t</a>');
  assert.strictEqual(render("b"), '<a title="b">t</a>');
  assert.throws(() => render(unescaped("<b>")), /doubleQuoted/);
  assert.strictEqual(render("c"), '<a title="c">t</a>');
});

test("an invalid escape sequence is refused, not rendered", () => {
  const firstChunk = (strings: TemplateStringsArray): unknown => strings[0];

  assert.strictEqual(firstChunk`a\uZZb`, undefined);
  assert.throws(() => html`a\uZZb${1}c`, /invalid escape sequence/);
  assert.throws(() => html`ok${1}then\x2y`, /chunk 1 has an invalid escape/);
});

// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { html } from "../../src/html/index.js";
import {
  type Interpolation,
  lineOf,
  opener,
  type Position,
  root,
  scan,
  scanIn,
  sources,
  template,
  templateSources,
} from "../support/html-position.js";

const fixture = "test/fixtures/unquoted-attribute.ts.fixture";

const safePositions: ReadonlySet<Position> = new Set<Position>([
  "text",
  "doubleQuoted",
  "singleQuoted",
]);

function violations(source: string): Interpolation[] {
  return scan(source).filter(({ position }) => !safePositions.has(position));
}

test("an interpolation inside a quoted value or text is allowed", () => {
  const allowed = [
    `\${x}`,
    `<p>\${x}</p>`,
    `<a href="\${x}">t</a>`,
    `<a href='\${x}'>t</a>`,
    `<a class="a \${x} b" rel="y">t</a>`,
    `<a title="a>b \${x}">t</a>`,
    `<img src="\${x}" alt="" />`,
    `<a\n  href="\${x}"\n  rel='\${y}'\n>t</a>`,
  ];

  for (const markup of allowed) {
    assert.deepStrictEqual(violations(template(markup)), [], markup);
  }
});

test("an interpolation outside a quoted value is a violation", () => {
  const planted: [string, Position][] = [
    [`<a href=\${x}>t</a>`, "beforeAttrValue"],
    [`<a href= \${x}>t</a>`, "beforeAttrValue"],
    [`<a href\n  =\${x}>t</a>`, "beforeAttrValue"],
    [`<a href=/r/\${x}>t</a>`, "unquoted"],
    [`<a \${x}>t</a>`, "beforeAttrName"],
    [`<a \${x}="y">t</a>`, "beforeAttrName"],
    [`<a href="y" \${x}>t</a>`, "beforeAttrName"],
    [`<a data-\${x}="y">t</a>`, "attrName"],
    [`<\${x}>t</a>`, "tagName"],
  ];

  for (const [markup, position] of planted) {
    assert.deepStrictEqual(
      violations(template(markup)).map((found) => found.position),
      [position],
      markup,
    );
  }
});

test("each template is classified from its own text position", () => {
  const unclosed = template(`<a href="\${x}"`);

  assert.deepStrictEqual(
    violations(`${unclosed}\n${template(`<p>\${y}</p>`)}`),
    [],
  );
});

test("a template nested in a substitution is classified on its own", () => {
  const inner = template(`<a href=\${item}>x</a>`);
  const outer = template(`<ul>\${items.map((item) => ${inner})}</ul>`);

  assert.strictEqual(scan(outer).length, 2);
  assert.deepStrictEqual(
    violations(outer).map((found) => found.position),
    ["beforeAttrValue"],
  );
});

test("a tag the html function does not own is left alone", () => {
  const backtick = opener.slice(-1);
  const shadowed = `my${opener}<a href=\${x}>t</a>${backtick}`;
  const property = `page.${opener}<a href=\${x}>t</a>${backtick}`;

  assert.deepStrictEqual(scan(shadowed), []);
  assert.deepStrictEqual(scan(property), []);
});

test("source the scanner cannot parse fails loudly", () => {
  assert.throws(() => scan(`${opener}<p>`), /unterminated/);
  assert.throws(() => scan(template(`<p>\${x`)), /unterminated/);
  assert.throws(() => scan(template(`<p>\${"x}</p>`)), /unterminated/);
});

test("the planted fixture is caught", () => {
  const source = readFileSync(join(root, fixture), "utf8");
  const found = scan(source);
  const caught = violations(source);

  assert.deepStrictEqual(
    caught.map(({ position }) => position),
    ["beforeAttrValue", "unquoted", "beforeAttrName"],
  );
  assert.strictEqual(found.length - caught.length, 2);

  for (const { index } of caught) {
    assert.ok(
      source.startsWith(`\${`, index),
      `not an interpolation: ${index}`,
    );
  }
});

test("no interpolation lands in an unquoted attribute position", () => {
  const files = templateSources();
  const reported: string[] = [];
  let classified = 0;

  for (const file of files) {
    for (const found of scanIn(file)) {
      classified += 1;
      if (safePositions.has(found.position)) continue;
      reported.push(
        `${file.path}:${lineOf(file.source, found.index)} ${found.position}`,
      );
    }
  }

  assert.ok(files.length > 0, "found no template source to check");
  assert.ok(classified > 0, "found no interpolations to classify");
  assert.ok(
    files.some(({ path }) => path.startsWith("src/")),
    "the corpus holds no template under src/, so this gate is reading no product code",
  );
  assert.deepStrictEqual(reported, []);
});

test("the html tag is never imported under another name", () => {
  const aliased = sources()
    .filter(({ source }) =>
      /import\s[^;]*(?:\bhtml\s+as\s+\w+|\*\s+as\s+\w+\s+from\s+"[^"]*html\/index)/.test(
        source,
      ),
    )
    .map(({ path }) => path);

  assert.deepStrictEqual(
    aliased,
    [],
    "both the corpus filter and the opener key on the literal tag name, so an alias leaves the template unscanned",
  );
});

test("escaping does not cover what ends an unquoted value", () => {
  const payload = "x onmouseover=alert(1)";
  const quoted = html`<a title="${payload}">t</a>`.value;

  assert.strictEqual(quoted, '<a title="x onmouseover=alert(1)">t</a>');
  assert.strictEqual(html`${" \t\n\f\r"}`.value, " \t\n\f\r");
});

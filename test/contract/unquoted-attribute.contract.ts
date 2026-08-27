// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { html } from "../../src/html/index.js";

type Position =
  | "text"
  | "tagName"
  | "beforeAttrName"
  | "attrName"
  | "afterAttrName"
  | "beforeAttrValue"
  | "doubleQuoted"
  | "singleQuoted"
  | "unquoted";

type Interpolation = { index: number; position: Position };

const root = resolve(import.meta.dirname, "../../..");
const fixture = "test/fixtures/unquoted-attribute.ts.fixture";

// spelled, never written, so this file is not a template of its own
const backtick = "`";
const opener = `html${backtick}`;

const safePositions: ReadonlySet<Position> = new Set<Position>([
  "text",
  "doubleQuoted",
  "singleQuoted",
]);

const asciiWhitespace = new Set(["\t", "\n", "\f", "\r", " "]);

function step(position: Position, char: string): Position {
  switch (position) {
    case "text":
      return char === "<" ? "tagName" : "text";
    case "tagName":
      if (char === ">") return "text";
      return asciiWhitespace.has(char) ? "beforeAttrName" : "tagName";
    case "beforeAttrName":
      if (char === ">") return "text";
      if (char === "/" || asciiWhitespace.has(char)) return "beforeAttrName";
      return "attrName";
    case "attrName":
    case "afterAttrName":
      if (char === "=") return "beforeAttrValue";
      if (char === ">") return "text";
      if (char === "/") return "beforeAttrName";
      return asciiWhitespace.has(char) ? "afterAttrName" : "attrName";
    case "beforeAttrValue":
      if (asciiWhitespace.has(char)) return "beforeAttrValue";
      if (char === '"') return "doubleQuoted";
      if (char === "'") return "singleQuoted";
      if (char === ">") return "text";
      return "unquoted";
    case "doubleQuoted":
      return char === '"' ? "beforeAttrName" : "doubleQuoted";
    case "singleQuoted":
      return char === "'" ? "beforeAttrName" : "singleQuoted";
    case "unquoted":
      if (char === ">") return "text";
      return asciiWhitespace.has(char) ? "beforeAttrName" : "unquoted";
  }
}

function endOfString(source: string, start: number, quote: string): number {
  let index = start;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index += 1;
  }

  throw new Error(`unterminated string at ${start}`);
}

function endOfSubstitution(source: string, start: number): number {
  let depth = 1;
  let index = start;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === '"' || char === "'") {
      index = endOfString(source, index + 1, char);
      continue;
    }
    if (char === backtick) {
      index = walkTemplate(source, index + 1, null);
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }

  throw new Error(`unterminated substitution at ${start}`);
}

function walkTemplate(
  source: string,
  start: number,
  found: Interpolation[] | null,
): number {
  let position: Position = "text";
  let index = start;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === backtick) return index + 1;
    if (char === "$" && source[index + 1] === "{") {
      found?.push({ index, position });
      index = endOfSubstitution(source, index + 2);
      continue;
    }

    position = step(position, char);
    index += 1;
  }

  throw new Error(`unterminated template literal at ${start}`);
}

function scan(source: string): Interpolation[] {
  const found: Interpolation[] = [];
  let from = 0;

  for (;;) {
    const at = source.indexOf(opener, from);
    if (at === -1) return found;

    from = at + 1;
    if (at > 0 && /[\w$.]/.test(source[at - 1])) continue;

    walkTemplate(source, at + opener.length, found);
  }
}

function violations(source: string): Interpolation[] {
  return scan(source).filter(({ position }) => !safePositions.has(position));
}

function template(markup: string): string {
  return `${opener}${markup}${backtick}`;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function templateSources(): { path: string; source: string }[] {
  const listed = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "-c",
      "-o",
      "--exclude-standard",
      "--",
      "src",
      "test",
      "scripts",
    ],
    { cwd: root, encoding: "utf8" },
  );

  return listed
    .split("\0")
    .filter((path) => path !== "" && !path.startsWith("test/fixtures/"))
    .map((path) => ({ path, source: readFileSync(join(root, path), "utf8") }))
    .filter(({ source }) => source.includes(opener));
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
  const shadowed = `myhtml${backtick}<a href=\${x}>t</a>${backtick}`;
  const property = `page.html${backtick}<a href=\${x}>t</a>${backtick}`;

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

  for (const { path, source } of files) {
    for (const found of scan(source)) {
      classified += 1;
      if (safePositions.has(found.position)) continue;
      reported.push(`${path}:${lineOf(source, found.index)} ${found.position}`);
    }
  }

  assert.ok(files.length > 0, "found no template source to check");
  assert.ok(classified > 0, "found no interpolations to classify");
  assert.deepStrictEqual(reported, []);
});

test("escaping does not cover what ends an unquoted value", () => {
  const payload = "x onmouseover=alert(1)";
  const quoted = html`<a title="${payload}">t</a>`.value;

  assert.strictEqual(quoted, '<a title="x onmouseover=alert(1)">t</a>');
  assert.strictEqual(html`${" \t\n\f\r"}`.value, " \t\n\f\r");
});

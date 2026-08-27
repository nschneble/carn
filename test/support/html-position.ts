// SPDX-License-Identifier: AGPL-3.0-or-later

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type Position =
  | "text"
  | "tagName"
  | "beforeAttrName"
  | "attrName"
  | "afterAttrName"
  | "beforeAttrValue"
  | "doubleQuoted"
  | "singleQuoted"
  | "unquoted";

export type Interpolation = { index: number; end: number; position: Position };

export const root = resolve(import.meta.dirname, "../../..");

// spelled, never written, so this file is not a template of its own
const backtick = "`";
export const opener = `html${backtick}`;

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
      const end = endOfSubstitution(source, index + 2);

      found?.push({ index, end, position });
      index = end;
      continue;
    }

    position = step(position, char);
    index += 1;
  }

  throw new Error(`unterminated template literal at ${start}`);
}

export function scan(source: string): Interpolation[] {
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

export function substitution(source: string, found: Interpolation): string {
  return source.slice(found.index + 2, found.end - 1);
}

export function template(markup: string): string {
  return `${opener}${markup}${backtick}`;
}

export function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

export function templateSources(): { path: string; source: string }[] {
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

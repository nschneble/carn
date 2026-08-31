// SPDX-License-Identifier: AGPL-3.0-or-later

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

const asciiWhitespace = new Set(["\t", "\n", "\f", "\r", " "]);

export function step(position: Position, char: string): Position {
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

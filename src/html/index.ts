// SPDX-License-Identifier: AGPL-3.0-or-later

import { type Position, step } from "./position.js";

export class Raw {
  constructor(readonly value: string) {}
}

export function raw(value: string): Raw {
  return new Raw(value);
}

const entitiesRegex = /[&<>"']/g;
const entities = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
} as const;

function escapeHtml(value: string): string {
  return value.replace(
    entitiesRegex,
    (char) => entities[char as keyof typeof entities],
  );
}

function render(value: unknown, position: Position): string {
  if (value instanceof Raw) {
    if (position !== "text") {
      throw new Error(`html: raw value in ${position} position.`);
    }
    return value.value;
  }

  if (typeof value === "string") return escapeHtml(value);
  if (typeof value === "number" || typeof value === "bigint")
    return String(value);

  if (value === null || value === undefined || typeof value === "boolean")
    return "";

  if (Array.isArray(value))
    return value.map((element) => render(element, position)).join("");

  return escapeHtml(String(value));
}

function cooked(strings: TemplateStringsArray, index: number): string {
  const chunk: string | undefined = strings[index];
  if (chunk === undefined) {
    throw new Error(`html: chunk ${index} has an invalid escape sequence.`);
  }
  return chunk;
}

const classified = new WeakMap<TemplateStringsArray, Position[]>();

function positions(strings: TemplateStringsArray): Position[] {
  const cached = classified.get(strings);
  if (cached !== undefined) return cached;

  const found: Position[] = [];
  let position: Position = "text";

  for (let index = 0; index < strings.length - 1; index += 1) {
    for (const char of cooked(strings, index)) position = step(position, char);
    found.push(position);
  }

  classified.set(strings, found);
  return found;
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  const sites = positions(strings);
  let out = cooked(strings, 0);
  for (const [index, value] of values.entries()) {
    out += render(value, sites[index]) + cooked(strings, index + 1);
  }
  return new Raw(out);
}

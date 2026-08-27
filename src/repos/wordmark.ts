// SPDX-License-Identifier: AGPL-3.0-or-later

// a repo's default identity. the name hashes to a seed; the seed spends
// on layers, offset, drift, rotation, weight, width, and fill-or-outline.
// two colours and the ground, from --accent and --ink. BRAND.md 06

import { html, type Raw } from "../html/index.js";

const em = 100;
const ascent = 0.89 * em;
const descent = 0.22 * em;
const lineStep = 0.98 * em;
const driftBand = 0.05 * em;
const strokeWidth = 0.035 * em;
const singleLineLimit = 18;
const separators = new Set(["-", "_", "."]);
const cacheLimit = 512;

const cache = new Map<string, Raw>();

function advance(char: string): number {
  if ("iIjl.-_".includes(char)) return 0.28;
  if ("frt".includes(char)) return 0.37;
  if ("mwMW".includes(char)) return 0.85;
  if (char >= "0" && char <= "9") return 0.55;
  if (char >= "A" && char <= "Z") return 0.63;
  return 0.53;
}

// the axes stretch the face, so the estimate has to move with them
function estimate(text: string, weight: number, width: number): number {
  let total = 0;
  for (const char of text) total += advance(char);
  return total * em * (width / 100) * (1 + (0.22 * (weight - 400)) / 500);
}

function seedOf(name: string): number {
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode(name)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function generator(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

function split(name: string): string[] {
  if (name.length <= singleLineLimit) return [name];

  const middle = name.length / 2;
  let at = -1;

  for (let index = 1; index < name.length - 1; index += 1) {
    if (!separators.has(name[index])) continue;
    if (at === -1 || Math.abs(index - middle) < Math.abs(at - middle)) {
      at = index;
    }
  }

  return at === -1 ? [name] : [name.slice(0, at + 1), name.slice(at + 1)];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function identifier(name: string, seed: number): string {
  return `w-${name.replace(/[^A-Za-z0-9_-]/g, "-")}-${seed.toString(36)}`;
}

function line(
  row: string,
  drift: number[],
  baseline: number,
  span: number,
): Raw {
  const glyphs = [...row].map(
    (char, index) =>
      html`<tspan y="${round(baseline + (drift[index] ?? 0))}">${char}</tspan>`,
  );

  return html`<text x="0" textLength="${round(span)}" lengthAdjust="spacingAndGlyphs">${glyphs}</text>`;
}

function build(name: string): Raw {
  const next = generator(seedOf(name));

  const layers = 2 + Math.floor(next() * 3);
  const heading = Math.floor(next() * 8) * (Math.PI / 4);
  const reach = (0.04 + next() * 0.06) * em;
  const rotation = (next() * 2 - 1) * 2.5;
  const weight = Math.round(400 + next() * 500);
  const width = Math.round(100 + next() * 25);
  const outlined = next() < 0.5;
  const swapped = next() < 0.5;

  const rows = split(name);
  const drifts = rows.map((row) =>
    [...row].map(() => (next() * 2 - 1) * driftBand),
  );
  const spans = rows.map((row) => estimate(row, weight, width));

  const step = { x: Math.cos(heading) * reach, y: Math.sin(heading) * reach };
  const spread = {
    x: Math.abs(step.x) * (layers - 1),
    y: Math.abs(step.y) * (layers - 1),
  };
  const edge = outlined ? strokeWidth : 0;

  const boxWidth = Math.max(...spans) + spread.x + edge;
  const boxHeight =
    (rows.length - 1) * lineStep +
    ascent +
    descent +
    spread.y +
    2 * driftBand +
    edge;

  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const boardWidth = boxWidth * cos + boxHeight * sin;
  const boardHeight = boxWidth * sin + boxHeight * cos;

  const origin = {
    x: (step.x < 0 ? spread.x : 0) + edge / 2,
    y: (step.y < 0 ? spread.y : 0) + driftBand + edge / 2 + ascent,
  };

  const id = identifier(name, seedOf(name));
  const back = swapped ? "var(--ink)" : "var(--accent)";
  const front = swapped ? "var(--accent)" : "var(--ink)";

  const text = rows.map((row, index) =>
    line(row, drifts[index] ?? [], index * lineStep, spans[index] ?? 0),
  );

  const stack = Array.from({ length: layers }, (_, index) => {
    const depth = layers - 1 - index;
    const place = `translate(${round(origin.x + step.x * depth)}, ${round(origin.y + step.y * depth)})`;

    if (depth > 0) {
      return html`<use href="#${id}" transform="${place}" fill="${back}" />`;
    }

    return outlined
      ? html`<use href="#${id}" transform="${place}" fill="none" stroke="${front}" stroke-width="${round(strokeWidth)}" stroke-linejoin="round" />`
      : html`<use href="#${id}" transform="${place}" fill="${front}" />`;
  });

  const pivot = `translate(${round(boardWidth / 2)}, ${round(boardHeight / 2)}) rotate(${round(rotation)}) translate(${round(-boxWidth / 2)}, ${round(-boxHeight / 2)})`;

  return html`<svg class="mark" viewBox="0 0 ${round(boardWidth)} ${round(boardHeight)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" font-size="${em}" font-weight="${weight}" font-stretch="${width}%"><defs><g id="${id}">${text}</g></defs><g transform="${pivot}">${stack}</g></svg>`;
}

export function wordmark(name: string): Raw {
  const known = cache.get(name);
  if (known !== undefined) return known;

  const mark = build(name);
  cache.set(name, mark);

  if (cache.size > cacheLimit) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  return mark;
}

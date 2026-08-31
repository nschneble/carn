// SPDX-License-Identifier: AGPL-3.0-or-later

// what a visitor downloads on a cold cache, measured the way Caddy will
// serve it. level 5 is `encode gzip`'s default, so the number can never
// flatter production, and Phase 2's Caddy owes at least this much

import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { minifyCss } from "./minify-css.js";
import { stylesheet } from "./styles.js";

const root = resolve(import.meta.dirname, "../../..");

export const gzipLevel = 5;
export const budgetBytes = 100 * 1024;

// woff2 is brotli inside and does not shrink again, so it counts whole
const faces = ["carn-sans.woff2", "carn-mono-400.woff2", "carn-mono-500.woff2"];

export function gzipBytes(body: string | Buffer): number {
  const source = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return gzipSync(source, { level: gzipLevel }).length;
}

export const fontBytes = faces.reduce(
  (total, face) => total + statSync(join(root, "fonts", face)).size,
  0,
);

export const servedStylesheet = minifyCss(stylesheet);
export const stylesheetWireBytes = gzipBytes(servedStylesheet);

// what the budget has left once the fonts and the served sheet are paid
// for, before any page chrome: the ceiling on a first-party inline asset
export const assetRoomBytes = budgetBytes - fontBytes - stylesheetWireBytes;

export function pageWireBytes(
  markup: string,
  sheetWire = stylesheetWireBytes,
): number {
  return fontBytes + sheetWire + gzipBytes(markup);
}

// gzip of chrome and content together beats the sum of the two, so sizing
// against this under-fills rather than overruns
export function remainingWireBytes(
  chrome: string,
  sheetWire = stylesheetWireBytes,
): number {
  return budgetBytes - pageWireBytes(chrome, sheetWire);
}

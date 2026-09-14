// SPDX-License-Identifier: AGPL-3.0-or-later

// what a visitor downloads on a cold cache

import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { servedStylesheet } from "./styles.js";

const root = resolve(import.meta.dirname, "../../..");

export const gzipLevel = 5;
export const budgetBytes = 100 * 1024;

// woff2 is brotli inside, so it's counted as-is
const faces = ["carn-sans.woff2", "carn-mono-400.woff2", "carn-mono-500.woff2"];

export function gzipBytes(body: string | Buffer): number {
  const source = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return gzipSync(source, { level: gzipLevel }).length;
}

export const fontBytes = faces.reduce(
  (total, face) => total + statSync(join(root, "fonts", face)).size,
  0,
);

export const stylesheetWireBytes = gzipBytes(servedStylesheet);
export const assetRoomBytes = budgetBytes - fontBytes - stylesheetWireBytes;

export function pageWireBytes(
  markup: string,
  sheetWire = stylesheetWireBytes,
): number {
  return fontBytes + sheetWire + gzipBytes(markup);
}

// gzip beats the sum of the parts, so this under-fills and never overruns
export function remainingWireBytes(
  chrome: string,
  sheetWire = stylesheetWireBytes,
): number {
  return budgetBytes - pageWireBytes(chrome, sheetWire);
}

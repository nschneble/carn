// SPDX-License-Identifier: AGPL-3.0-or-later

import { type BlobPage, blobPage } from "../../src/html/blob-page.js";
import { sniffRaster } from "../../src/repos/blob-asset.js";
import { type BlobView, maxSourceBytes } from "../../src/repos/blob-view.js";

export const rawOrigin = "https://gelatinous-cube.example";

// long enough to overflow 1440px, or scrollable-region-focusable reports
// inapplicable and the tabindex it pins goes unproven
const longLine =
  'const banner = "the quick brown fox jumps over the lazy dog, and then keeps going far past the gutter so the block has somewhere to scroll to, which is the whole point of this line";';

export const sampleSource = `// a small sample, one of every scope the sheet colors
import { readFile } from "node:fs/promises";

export type Cursor = { after: string | null; limit: number };

const pattern = /^[a-z][a-z0-9-]*$/;
const fallback = 25;
const enabled = true;

${longLine}

/**
 * @param cursor where to resume from
 */
export async function page(cursor: Cursor): Promise<string[]> {
  const limit = cursor.limit ?? fallback;
  const body = await readFile("rows.txt", "utf8");
  const rows = body.split("\\n").filter((row) => pattern.test(row));

  if (!enabled) {
    throw new Error(\`paging is off for \${cursor.after}\`);
  }

  return rows.slice(0, limit);
}
`;

export const pngBody = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const svgBody = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 1"><title>injected</title><rect width="4" height="1" /></svg>\n`;

function base(path: string, bytes: number): Omit<BlobView, "kind"> {
  return {
    rev: "main",
    path,
    oid: "a".repeat(40),
    bytes,
    format: null,
    source: null,
    lines: 0,
    whole: bytes <= maxSourceBytes,
  };
}

function countLines(source: string): number {
  const breaks = source.split("\n").length;
  return source.endsWith("\n") ? breaks - 1 : breaks;
}

export function textBlob(path: string, source: string): BlobView {
  const bytes = Buffer.byteLength(source, "utf8");

  return {
    ...base(path, bytes),
    kind: "text",
    source,
    lines: countLines(source),
  };
}

export function rasterBlob(
  path: string,
  body: Buffer,
  bytes?: number,
): BlobView {
  return {
    ...base(path, bytes ?? body.length),
    kind: "raster",
    format: sniffRaster(body),
  };
}

export function binaryBlob(path: string, bytes: number): BlobView {
  return { ...base(path, bytes), kind: "binary" };
}

// a file no cap can fit whole: unique identifiers so it barely compresses
export function largeSource(lines: number): string {
  return `${Array.from(
    { length: lines },
    (_, index) =>
      `export const symbol${index} = { id: "k${index}q${index * 7919}", weight: ${index * 31}, tag: "t${index * 13}" };`,
  ).join("\n")}\n`;
}

export const smallBlob = textBlob("src/repos/page.ts", sampleSource);
export const hugeBlob = textBlob("src/generated/rows.ts", largeSource(6310));
export const imageBlob = rasterBlob("assets/logo.png", pngBody);
export const svgBlob = textBlob(".carn/header.svg", svgBody);

export function blobDocument(options: Partial<BlobPage> = {}): string {
  return blobPage({ repo: "linklater", blob: smallBlob, ...options });
}

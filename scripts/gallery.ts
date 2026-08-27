// SPDX-License-Identifier: AGPL-3.0-or-later

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Theme } from "../src/html/theme.js";
import { galleryDocument } from "../test/gallery/document.js";

const root = resolve(import.meta.dirname, "../..");
const out = join(root, "local/gallery");
const faces = [
  "archivo-carn.woff2",
  "carn-mono-400.woff2",
  "carn-mono-500.woff2",
];

function beside(document: string): string {
  return document.replaceAll('url("/fonts/', 'url("fonts/');
}

const pages: [string, Theme | null][] = [
  ["dark.html", "dark"],
  ["light.html", "light"],
  ["unstamped.html", null],
];

mkdirSync(join(out, "fonts"), { recursive: true });

for (const face of faces) {
  copyFileSync(join(root, "fonts", face), join(out, "fonts", face));
}

for (const [name, theme] of pages) {
  writeFileSync(join(out, name), beside(galleryDocument(theme)), "utf8");
  console.log(`wrote local/gallery/${name}`);
}

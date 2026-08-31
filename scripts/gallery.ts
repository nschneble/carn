// SPDX-License-Identifier: AGPL-3.0-or-later

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { galleryDocument } from "../test/gallery/document.js";

const root = resolve(import.meta.dirname, "../..");
const out = join(root, "local/gallery");
const faces = ["carn-sans.woff2", "carn-mono-400.woff2", "carn-mono-500.woff2"];

function beside(document: string): string {
  return document.replaceAll('url("/fonts/', 'url("fonts/');
}

mkdirSync(join(out, "fonts"), { recursive: true });

for (const face of faces) {
  copyFileSync(join(root, "fonts", face), join(out, "fonts", face));
}

// one page: the palette follows the operating system, so switch that
writeFileSync(join(out, "gallery.html"), beside(galleryDocument()), "utf8");
console.log("wrote local/gallery/gallery.html");

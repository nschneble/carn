// SPDX-License-Identifier: AGPL-3.0-or-later

// the cap is computed from what the budget leaves after fonts, sheet, and
// chrome, then checked against a real gzip of the real page. the source is
// cut before it is highlighted, never after: a scope opening on one line
// and closing forty later would leave cut markup unbalanced

import { blobAssetPath } from "../repos/blob-asset.js";
import type { BlobView } from "../repos/blob-view.js";
import { smallCaps } from "./filename.js";
import { html, type Raw, raw } from "./index.js";
import { page } from "./page.js";
import { highlight, type Language, languageFor } from "./syntax.js";
import {
  budgetBytes,
  pageWireBytes,
  remainingWireBytes,
  stylesheetWireBytes,
} from "./wire-weight.js";

export type BlobPage = {
  repo: string;
  blob: BlobView;
  rawOrigin?: string | undefined;
  sheetWire?: number;
};

// measured over 88 files of this repo's own typescript: 604,313 source
// bytes highlight and gzip to 210,433 wire bytes
export const wirePerSourceByte = 0.348;

const capPasses = 6;

const binaryLabels: Record<string, string> = {
  gz: "gzip archive",
  mp3: "MP3 audio",
  mp4: "MP4 video",
  pdf: "PDF document",
  tar: "tar archive",
  wasm: "WebAssembly module",
  woff2: "WOFF2 font",
  zip: "ZIP archive",
};

const units = ["B", "KB", "MB", "GB"];

// a locale-sensitive formatter would read one way here and another in the
// alpine container, so the separator is placed rather than negotiated
function formatCount(count: number): string {
  const digits = String(Math.trunc(Math.abs(count)));
  const groups: string[] = [];

  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }

  return `${count < 0 ? "-" : ""}${groups.join(",")}`;
}

function formatBytes(bytes: number): string {
  let scaled = bytes;
  let unit = 0;

  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }

  const rounded = unit === 0 ? String(bytes) : scaled.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

function extensionOf(path: string): string {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1);
}

function typeName(blob: BlobView): string {
  if (blob.format !== null) {
    return `${blob.format.extension === "jpg" ? "JPEG" : blob.format.extension.toUpperCase()} image`;
  }

  if (blob.kind === "text") return "Text file";

  return binaryLabels[extensionOf(blob.path)] ?? "Binary file";
}

function rawHref(origin: string, repo: string, blob: BlobView): string {
  const segments = [repo, ...blob.rev.split("/"), ...blob.path.split("/")];
  return `${origin}/${segments.map(encodeURIComponent).join("/")}`;
}

function hatch(view: BlobPage, label: string): Raw {
  if (view.rawOrigin === undefined) return html``;

  const href = rawHref(view.rawOrigin, view.repo, view.blob);

  return html`
      <p class="showall"><a class="t-mono" href="${href}">${label}<span class="vh"> · ${view.blob.path}</span><span aria-hidden="true"> →</span></a></p>`;
}

function field(term: string, value: string): Raw {
  return html`<div><dt>${term}</dt><dd>${value}</dd></div>`;
}

function sourceMeta(blob: BlobView, language: Language | null): Raw {
  return html`<dl class="meta">${[
    field("Size", formatBytes(blob.bytes)),
    field("Lines", formatCount(blob.lines)),
    field("Language", language?.label ?? "Plain text"),
  ]}</dl>`;
}

function objectMeta(blob: BlobView): Raw {
  return html`<dl class="meta">${[
    field("Size", formatBytes(blob.bytes)),
    field("Type", typeName(blob)),
  ]}</dl>`;
}

function heading(blob: BlobView): Raw {
  return html`<h1 class="t-item" lang="en" id="blob-h">${smallCaps(blob.path)}</h1>`;
}

function codeClass(language: Language | null): string {
  return language === null ? "hljs" : `hljs language-${language.id}`;
}

function shell(view: BlobPage, main: Raw): string {
  const { repo, blob } = view;

  return page({
    title: `${blob.path} · ${repo} · Càrn`,
    description: `${blob.path} at ${blob.rev} in ${repo}.`,
    path: `/r/${repo}/blob/${blob.rev}/${blob.path}`,
    main,
  });
}

function sourceDocument(
  view: BlobPage,
  language: Language | null,
  body: Raw,
  shown: number | null,
): string {
  const { blob } = view;
  const cls = codeClass(language);

  const block =
    shown === null
      ? html`<pre class="src" tabindex="0" role="region" aria-labelledby="blob-h"><code class="${cls}">${body}</code></pre>`
      : html`<p class="t-label" id="blob-cut">Showing the first ${formatCount(shown)} lines of ${formatCount(blob.lines)}.</p>
      <pre class="src" tabindex="0" role="region" aria-labelledby="blob-h" aria-describedby="blob-cut"><code class="${cls}">${body}</code></pre>`;

  return shell(
    view,
    html`${heading(blob)}
      ${sourceMeta(blob, language)}
      ${block}${shown === null ? html`` : hatch(view, "Show entire file")}`,
  );
}

function declined(view: BlobPage, said: string): string {
  return shell(
    view,
    html`${heading(view.blob)}
      ${objectMeta(view.blob)}
      <div class="empty">
        <p class="t-body">${said}</p>
      </div>${hatch(view, "Open raw")}`,
  );
}

function preview(view: BlobPage, asset: string): string {
  return shell(
    view,
    html`${heading(view.blob)}
      ${objectMeta(view.blob)}
      <img class="preview" src="${asset}" alt="" />${hatch(view, "Open raw")}`,
  );
}

function cutToBytes(source: string, capBytes: number): string {
  const body = Buffer.from(source, "utf8");
  if (body.length <= capBytes) return source;

  const feed = body.subarray(0, capBytes).lastIndexOf(0x0a);
  return feed === -1 ? "" : body.subarray(0, feed + 1).toString("utf8");
}

function countLines(source: string): number {
  if (source === "") return 0;
  const breaks = source.split("\n").length;
  return source.endsWith("\n") ? breaks - 1 : breaks;
}

function joinLines(lines: string[], count: number): string {
  return count === 0 ? "" : `${lines.slice(0, count).join("\n")}\n`;
}

function highlighted(
  blob: BlobView,
  source: string,
  language: Language | null,
): Raw {
  return raw(highlight({ oid: blob.oid, source, language }));
}

// the number a stylesheet change has to move: exported so a contract test
// can feed it a different served-sheet size and watch the cap follow
export function sourceCapBytes(view: BlobPage): number {
  const sheetWire = view.sheetWire ?? stylesheetWireBytes;
  const language = languageFor(view.blob.path);
  const chrome = sourceDocument(view, language, raw(""), view.blob.lines);

  return Math.max(
    0,
    Math.floor(remainingWireBytes(chrome, sheetWire) / wirePerSourceByte),
  );
}

function textPage(view: BlobPage, source: string): string {
  const sheetWire = view.sheetWire ?? stylesheetWireBytes;
  const language = languageFor(view.blob.path);
  const chrome = sourceDocument(view, language, raw(""), view.blob.lines);
  const remaining = remainingWireBytes(chrome, sheetWire);
  const capBytes = sourceCapBytes(view);

  if (Buffer.byteLength(source, "utf8") <= capBytes) {
    const whole = sourceDocument(
      view,
      language,
      highlighted(view.blob, source, language),
      null,
    );

    if (pageWireBytes(whole, sheetWire) <= budgetBytes) return whole;
  }

  const lines = source.split("\n");
  let shown = countLines(cutToBytes(source, capBytes));
  let rendered = "";

  for (let pass = 0; pass < capPasses; pass += 1) {
    const cut = joinLines(lines, shown);
    rendered = sourceDocument(
      view,
      language,
      highlighted(view.blob, cut, language),
      shown,
    );

    const weight = pageWireBytes(rendered, sheetWire);
    if (weight <= budgetBytes || shown === 0) return rendered;

    const content = Math.max(1, weight - (budgetBytes - remaining));
    const fitted = Math.floor((shown * remaining) / content);
    shown = Math.max(0, Math.min(fitted, shown - 1));
  }

  return rendered;
}

export function blobPage(view: BlobPage): string {
  const { blob } = view;

  const said = (why: string) =>
    `${typeName(blob)}, ${formatBytes(blob.bytes)}. ${why}`;

  if (blob.kind === "raster") {
    const sheetWire = view.sheetWire ?? stylesheetWireBytes;
    const room = remainingWireBytes(preview(view, ""), sheetWire);

    if (blob.whole && blob.format !== null && blob.bytes <= room) {
      return preview(
        view,
        blobAssetPath(view.repo, { oid: blob.oid, format: blob.format }),
      );
    }

    return declined(view, said("Too large to show here."));
  }

  if (!blob.whole) return declined(view, said("Too large to show here."));
  if (blob.kind === "binary") return declined(view, said("Not shown here."));

  return textPage(view, blob.source ?? "");
}

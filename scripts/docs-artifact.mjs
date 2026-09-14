// SPDX-License-Identifier: AGPL-3.0-or-later

// Renders Markdown docs as published artifact pages. The palette is taken
// from `docs/BRAND.md` at build time. Files written to `local/artifacts`

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import MarkdownIt from "markdown-it";

const strip = (block) =>
  block
    .split("\n")
    .map((l) => l.replace(/^\s+/, "  ").replace(/\s*\/\*.*?\*\/\s*$/, ""))
    .filter((l) => l.trim().startsWith("--") || l.includes("color-scheme"))
    .join("\n");

const SRC = "docs";
const BRAND_BOOK = readFileSync(`${SRC}/BRAND.md`, "utf8");
const DARK = strip(BRAND_BOOK.match(/:root \{\n(.*?)\n\}/s)[1]);
const LIGHT = strip(
  BRAND_BOOK.match(
    /@media \(prefers-color-scheme: light\) \{\n\s*:root[^{]*\{\n(.*?)\n\s{2}\}/s,
  )[1],
);

const DOCS = [
  {
    slug: "plan",
    file: "PLAN.md",
    name: "Implementation Plan",
    blurb: "Tenets, architecture, data model, and phase ladder.",
    url: "https://claude.ai/code/artifact/bd38dee8-6822-4b2c-a602-bde753e498a3",
  },
  {
    slug: "layout",
    file: "LAYOUT.md",
    name: "Layout Specification",
    blurb: "The page shapes and repo identity system.",
    url: "https://claude.ai/code/artifact/587c7ac1-5712-4927-bb82-8e5a80731f80",
  },
  {
    slug: "brand",
    file: "BRAND.md",
    name: "Brand Book",
    blurb: "Tokens, components, type, voice, and design nevers.",
    url: "https://claude.ai/code/artifact/234389d4-5e88-408d-936f-834ecf266f03",
  },
  {
    slug: "stack",
    file: "STACK.md",
    name: "Stack Currency",
    blurb: "Pinned majors, known hazards, and what's not surveyed.",
    url: "https://claude.ai/code/artifact/d6827af7-8151-4e7b-aace-e29617e51f99",
  },
];

const slugify = (content) =>
  content
    .toLowerCase()
    .replace(/[^\w\s·-]/g, "")
    .trim()
    .replace(/[\s·]+/g, "-")
    .replace(/-+/g, "-");

// anchors on h2/h3 so the contents list can reach them
const markdown = new MarkdownIt("commonmark", { html: false }).enable("table");
markdown.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const inline = tokens[idx + 1];
  if (/^h[23]$/.test(tokens[idx].tag) && inline?.type === "inline") {
    const id = slugify(inline.content);
    tokens[idx].attrSet("id", id);
    env.toc ??= [];
    if (tokens[idx].tag === "h2") env.toc.push({ id, text: inline.content });
  }
  return self.renderToken(tokens, idx, options);
};

const esc = (content) =>
  content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const css = (strings, ...values) => String.raw({ raw: strings }, ...values);

const FONTS =
  "https://fonts.googleapis.com/css2" +
  "?family=Archivo:ital,wdth,wght@0,100..125,400..900;1,100..125,400..900" +
  "&family=IBM+Plex+Mono:wght@400;500&display=swap";

const CSS = css`
:root {
${DARK}

  /* BRAND's 66ch is set for app prose; these are long reference docs */
  --measure: 68ch;
}

:root[data-theme="light"] {
${LIGHT}
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
${LIGHT}
  }
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-variation-settings: "wdth" 100, "wght" 400;
  font-size: 16.5px;
  line-height: 1.62;
  -webkit-font-smoothing: antialiased;
}

.wrap {
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 var(--s5);
}

/* masthead */

.masthead {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--ground);
  border-bottom: 1px solid var(--rule);
}

.masthead .wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s3) var(--s5);
  padding-top: var(--s3);
  padding-bottom: var(--s3);
}

.brandmark {
  font-family: "IBM Plex Mono", SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--ink);
  text-decoration: none;
}

.siblings {
  display: flex;
  gap: var(--s4);
  margin-left: auto;
  flex-wrap: wrap;
}

.siblings a, .siblings span {
  font-family: "IBM Plex Mono", SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  letter-spacing: .11em;
  text-transform: uppercase;
}

.siblings a { color: var(--accent-text); }
.siblings span { color: var(--ink-faint); }
.siblings [aria-current] { color: var(--ink); }

/* title block */

.title {
  padding: var(--s8) 0 var(--s6);
  border-bottom: 1px solid var(--rule);
}

.eyebrow {
  font-family: "IBM Plex Mono", SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .11em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin: 0 0 var(--s4);
}

h1.doc {
  font-variation-settings: "wdth" 118, "wght" 780;
  font-size: clamp(2.5rem, 7.6vw, 5rem);
  line-height: .92;
  letter-spacing: -.02em;
  text-wrap: balance;
  margin: 0;
}

.blurb {
  max-width: var(--measure);
  margin: var(--s5) 0 0;
  font-size: 1.06rem;
  color: var(--ink-soft);
}

.provenance {
  font-family: "IBM Plex Mono", SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  margin: var(--s6) 0 0;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

/* contents */

.toc {
  padding: var(--s6) 0;
  border-bottom: 1px solid var(--rule);
}

.toc ol {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 2px var(--s5);
  list-style: none;
  margin: var(--s4) 0 0;
  padding: 0;
}

.toc a {
  display: block;
  padding: 6px 0;
  border-bottom: 1px solid var(--rule-soft);
  font-variation-settings: "wdth" 110, "wght" 700;
  font-size: .96rem;
  color: var(--ink);
  text-decoration: none;
}

.toc a:hover,
.toc a:focus-visible {
  background: var(--sunk);
}

/* document body */

.doc-body {
  padding: var(--s8) 0;
}

.doc-body > * {
  max-width: var(--measure);
}

.doc-body > .wide,
.doc-body > pre,
.doc-body > .tablewrap {
  max-width: 100%;
}

.doc-body h2 {
  max-width: 100%;
  margin: var(--s8) 0 var(--s5);
  padding-top: var(--s5);
  border-top: 1px solid var(--ink);
  font-variation-settings: "wdth" 115, "wght" 760;
  font-size: clamp(1.75rem, 4.4vw, 2.7rem);
  line-height: .97;
  letter-spacing: -.015em;
  text-wrap: balance;
}

.doc-body h2:first-child {
  margin-top: 0;
}

.doc-body h3 {
  margin: var(--s7) 0 var(--s4);
  font-variation-settings: "wdth" 110, "wght" 700;
  font-size: 1.32rem;
  line-height: 1.14;
  text-wrap: balance;
}

.doc-body h4 {
  margin: var(--s6) 0 var(--s3);
  font-family: "IBM Plex Mono", SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .11em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.doc-body p {
  margin: 0 0 var(--s4);
}

.doc-body ul,
.doc-body ol {
  margin: 0 0 var(--s4);
  padding-left: 1.15em;
}

.doc-body li {
  margin: 0 0 6px;
}

.doc-body li::marker {
  color: var(--ink-faint);
}

.doc-body strong {
  font-variation-settings: "wdth" 100, "wght" 680;
}

.doc-body em {
  font-style: italic;
  color: var(--ink-soft);
}

.doc-body hr {
  margin: var(--s7) 0;
  border: 0;
  border-top: 1px solid var(--rule);
}

.doc-body a {
  color: var(--accent-text);
  text-underline-offset: 2px;
}

.doc-body code {
  padding: 1px 4px;
  background: var(--sunk);
  font-family: "IBM Plex Mono", SFMono-Regular, Menlo, monospace;
  font-size: .88em;
  color: var(--ink);
}

.doc-body pre {
  margin: 0 0 var(--s5);
  padding: var(--s4) var(--s5);
  border-left: 1px solid var(--rule);
  background: var(--sunk);
  overflow-x: auto;
}

.doc-body pre code {
  padding: 0;
  background: none;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink-soft);
}

.doc-body blockquote {
  margin: 0 0 var(--s5);
  padding: var(--s4) 0 var(--s4) var(--s5);
  border-left: 2px solid var(--accent);
  color: var(--ink-soft);
}

.doc-body blockquote > :last-child {
  margin-bottom: 0;
}

.doc-body blockquote strong {
  color: var(--ink);
}

/* tables */

.tablewrap {
  margin: 0 0 var(--s5);
  overflow-x: auto;
}

.doc-body table {
  width: 100%;
  border-collapse: collapse;
  font-size: .92rem;
  font-variant-numeric: tabular-nums;
}

.doc-body th {
  padding: 8px var(--s3) 8px 0;
  border-bottom: 1px solid var(--ink);
  text-align: left;
  vertical-align: bottom;
  font-family: "IBM Plex Mono", SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: .11em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.doc-body td {
  padding: 9px var(--s3) 9px 0;
  border-bottom: 1px solid var(--rule-soft);
  vertical-align: top;
  color: var(--ink-soft);
}

.doc-body td:first-child {
  color: var(--ink);
}

/* footer */

footer {
  padding: var(--s5) 0 var(--s8);
  border-top: 1px solid var(--rule);
}

footer p {
  font-family: "IBM Plex Mono", SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  margin: 0;
  color: var(--ink-faint);
}

footer a {
  color: var(--accent-text);
}

/* focus and motion */

:where(a, summary):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
`;

function page(doc, all) {
  const raw = readFileSync(`${SRC}/${doc.file}`, "utf8");
  const clean = raw.replace(/<!--[\s\S]*?-->/g, "");
  const lines = raw.split("\n").length;
  const bytes = Buffer.byteLength(raw, "utf8");

  // shell renders opening bold label, h1, and italic standfirst; remove
  const source = clean.split("\n");
  const hIdx = source.findIndex((l) => /^#\s+/.test(l));
  const heading = hIdx >= 0 ? source[hIdx].replace(/^#\s+/, "") : doc.name;

  let label = doc.name;
  for (let i = 0; i < (hIdx < 0 ? 0 : hIdx); i++) {
    const m = source[i].match(/^\*\*(.+)\*\*$/);
    if (m) {
      label = m[1];
      source[i] = "";
      break;
    }
  }

  let stand = doc.blurb;
  for (let i = hIdx + 1; i < Math.min(hIdx + 5, source.length); i++) {
    const m = source[i].match(/^_(.+)_$/);
    if (m) {
      stand = m[1];
      source[i] = "";
      break;
    }
  }

  if (hIdx >= 0) source[hIdx] = "";

  const env = {};
  const body = markdown
    .render(source.join("\n"), env)
    .replace(/<table>/g, '<div class="tablewrap"><table>')
    .replace(/<\/table>/g, "</table></div>");

  const siblings = all
    .map((d) =>
      d.slug === doc.slug
        ? `<span aria-current="page">${esc(d.name)}</span>`
        : `<a href="${d.url ?? "#"}">${esc(d.name)}</a>`,
    )
    .join("");

  const entries = (env.toc ?? [])
    .map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`)
    .join("");

  const contents = entries
    ? `<nav class="toc" aria-label="Contents">
    <p class="eyebrow">Contents</p>
    <ol>${entries}</ol>
  </nav>`
    : "";

  const provenance = [
    `Generated from docs/${esc(doc.file)}`,
    `${lines.toLocaleString("en")} lines`,
    `${bytes.toLocaleString("en")} B`,
    "palette lifted from BRAND.md at build time",
  ].join(" · ");

  return `
<title>Càrn ${doc.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style>

<header class="masthead">
  <div class="wrap">
    <a class="brandmark" href="#top">Càrn</a>
    <nav class="siblings" aria-label="Specification documents">${siblings}</nav>
  </div>
</header>

<main class="wrap" id="top">
  <div class="title">
    <p class="eyebrow">${esc(label)} · docs/${esc(doc.file)}</p>
    <h1 class="doc">${esc(heading)}</h1>
    <p class="blurb">${esc(stand)}</p>
    <p class="provenance">${provenance}</p>
  </div>

  ${contents}

  <div class="doc-body">${body}</div>
</main>

<footer class="wrap">
  <p>Càrn · AGPL-3.0-or-later · This page is generated from the Markdown source</p>
</footer>
`;
}

const OUT = "local/artifacts";
mkdirSync(OUT, { recursive: true });

for (const d of DOCS) {
  const out = `${OUT}/carn-${d.slug}.html`;
  writeFileSync(out, page(d, DOCS), "utf8");
  console.log(
    `file: ${out}, size: ${Math.floor(Buffer.byteLength(readFileSync(out)) / 1000).toLocaleString("en")} KB`,
  );
}

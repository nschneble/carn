// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Renders docs/*.md as the published artifact pages. The palette is lifted
// out of docs/BRAND.md at build time, so a page cannot drift from the brand
// book: edit the Markdown, run `node scripts/docs-artifact.mjs`, republish
// the four files it writes to local/artifacts/.
//
// The Markdown is the source of truth. The artifacts are a rendering of it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import MarkdownIt from "markdown-it";

const SRC = "docs";
const OUT = "local/artifacts";
mkdirSync(OUT, { recursive: true });

const brand = readFileSync(`${SRC}/BRAND.md`, "utf8");

// --- palette, straight out of BRAND.md's declared token block -------------
const dark = brand.match(/:root \{\n(.*?)\n\}/s)[1];
const light = brand.match(
  /@media \(prefers-color-scheme: light\) \{\n\s*:root[^{]*\{\n(.*?)\n\s{2}\}/s,
)[1];
const strip = (block) =>
  block
    .split("\n")
    .map((l) => l.replace(/^\s+/, "  ").replace(/\s*\/\*.*?\*\/\s*$/, ""))
    .filter((l) => l.trim().startsWith("--") || l.includes("color-scheme"))
    .join("\n");

const DARK = strip(dark);
const LIGHT = strip(light);

// --- documents -----------------------------------------------------------
const DOCS = [
  {
    slug: "plan",
    file: "PLAN.md",
    name: "Build Plan",
    blurb: "Tenets, architecture, data model, and the phase ladder.",
  },
  {
    slug: "layout",
    file: "LAYOUT.md",
    name: "Layout Study",
    blurb: "The three page shapes and the repo identity system.",
  },
  {
    slug: "brand",
    file: "BRAND.md",
    name: "Brand Book",
    blurb: "Tokens, components, type, voice, and the design nevers.",
  },
  {
    slug: "stack",
    file: "STACK.md",
    name: "Stack Currency",
    blurb:
      "Pinned majors, known hazards, and what is deliberately not surveyed.",
  },
];

const md = new MarkdownIt("commonmark", { html: false }).enable("table");

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^\w\s·-]/g, "")
    .trim()
    .replace(/[\s·]+/g, "-")
    .replace(/-+/g, "-");

// anchors on h2/h3 so the contents list can reach them
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const inline = tokens[idx + 1];
  if (/^h[23]$/.test(tokens[idx].tag) && inline?.type === "inline") {
    const id = slugify(inline.content);
    tokens[idx].attrSet("id", id);
    env.toc ??= [];
    if (tokens[idx].tag === "h2") env.toc.push({ id, text: inline.content });
  }
  return self.renderToken(tokens, idx, options);
};

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CSS = `
:root {
${DARK}
  /* BRAND's 66ch is set for app prose; these are long reference documents */
  --measure: 68ch;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
${LIGHT}
  }
}
:root[data-theme="light"] {
${LIGHT}
}

*, *::before, *::after { box-sizing: border-box; }

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

.wrap { max-width: 1160px; margin: 0 auto; padding: 0 var(--s5); }

/* --- masthead ---------------------------------------------------------- */
.masthead {
  position: sticky; top: 0; z-index: 10;
  background: var(--ground);
  border-bottom: 1px solid var(--rule);
}
.masthead .wrap {
  display: flex; flex-wrap: wrap; align-items: baseline;
  gap: var(--s3) var(--s5);
  padding-top: var(--s3); padding-bottom: var(--s3);
}
.brandmark {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; color: var(--ink); text-decoration: none;
}
.siblings { display: flex; gap: var(--s4); margin-left: auto; flex-wrap: wrap; }
.siblings a, .siblings span {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px; letter-spacing: .11em; text-transform: uppercase;
}
.siblings a { color: var(--accent-text); }
.siblings span { color: var(--ink-faint); }
.siblings [aria-current] { color: var(--ink); }

/* --- title block ------------------------------------------------------- */
.title { padding: var(--s8) 0 var(--s6); border-bottom: 1px solid var(--rule); }
.eyebrow {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; font-weight: 500; letter-spacing: .11em;
  text-transform: uppercase; color: var(--ink-faint);
  margin: 0 0 var(--s4);
}
h1.doc {
  font-variation-settings: "wdth" 118, "wght" 780;
  font-size: clamp(2.5rem, 7.6vw, 5rem);
  line-height: .92; letter-spacing: -.02em;
  text-wrap: balance; margin: 0;
}
.blurb {
  color: var(--ink-soft); max-width: var(--measure);
  margin: var(--s5) 0 0; font-size: 1.06rem;
}
.provenance {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: var(--ink-faint);
  margin: var(--s6) 0 0; font-variant-numeric: tabular-nums;
}

/* --- contents ---------------------------------------------------------- */
.toc { padding: var(--s6) 0; border-bottom: 1px solid var(--rule); }
.toc ol { list-style: none; margin: var(--s4) 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 2px var(--s5); }
.toc a {
  display: block; padding: 6px 0;
  border-bottom: 1px solid var(--rule-soft);
  color: var(--ink); text-decoration: none;
  font-variation-settings: "wdth" 110, "wght" 700;
  font-size: .96rem;
}
.toc a:hover, .toc a:focus-visible { background: var(--sunk); }

/* --- document body ----------------------------------------------------- */
.doc-body { padding: var(--s8) 0 var(--s8); }
.doc-body > * { max-width: var(--measure); }
.doc-body > .wide, .doc-body > pre, .doc-body > .tablewrap { max-width: 100%; }

.doc-body h2 {
  font-variation-settings: "wdth" 115, "wght" 760;
  font-size: clamp(1.75rem, 4.4vw, 2.7rem);
  line-height: .97; letter-spacing: -.015em; text-wrap: balance;
  margin: var(--s8) 0 var(--s5);
  padding-top: var(--s5); border-top: 1px solid var(--ink);
  max-width: 100%;
}
.doc-body h2:first-child { margin-top: 0; }
.doc-body h3 {
  font-variation-settings: "wdth" 110, "wght" 700;
  font-size: 1.32rem; line-height: 1.14; text-wrap: balance;
  margin: var(--s7) 0 var(--s4);
}
.doc-body h4 {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; font-weight: 500; letter-spacing: .11em;
  text-transform: uppercase; color: var(--ink-faint);
  margin: var(--s6) 0 var(--s3);
}
.doc-body p { margin: 0 0 var(--s4); }
.doc-body ul, .doc-body ol { margin: 0 0 var(--s4); padding-left: 1.15em; }
.doc-body li { margin: 0 0 6px; }
.doc-body li::marker { color: var(--ink-faint); }
.doc-body strong { font-variation-settings: "wdth" 100, "wght" 680; }
.doc-body em { font-style: italic; color: var(--ink-soft); }
.doc-body hr { border: 0; border-top: 1px solid var(--rule); margin: var(--s7) 0; }
.doc-body a { color: var(--accent-text); text-underline-offset: 2px; }

.doc-body code {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .88em; background: var(--sunk); padding: 1px 4px;
  color: var(--ink);
}
.doc-body pre {
  background: var(--sunk); padding: var(--s4) var(--s5);
  overflow-x: auto; margin: 0 0 var(--s5);
  border-left: 1px solid var(--rule);
}
.doc-body pre code {
  background: none; padding: 0; font-size: 12.5px; line-height: 1.5;
  color: var(--ink-soft);
}

.doc-body blockquote {
  margin: 0 0 var(--s5); padding: var(--s4) 0 var(--s4) var(--s5);
  border-left: 2px solid var(--accent);
  color: var(--ink-soft);
}
.doc-body blockquote > :last-child { margin-bottom: 0; }
.doc-body blockquote strong { color: var(--ink); }

.tablewrap { overflow-x: auto; margin: 0 0 var(--s5); }
.doc-body table {
  border-collapse: collapse; width: 100%;
  font-size: .92rem; font-variant-numeric: tabular-nums;
}
.doc-body th {
  text-align: left; border-bottom: 1px solid var(--ink);
  padding: 8px var(--s3) 8px 0; vertical-align: bottom;
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px; font-weight: 500; letter-spacing: .11em;
  text-transform: uppercase; color: var(--ink-faint);
}
.doc-body td {
  border-bottom: 1px solid var(--rule-soft);
  padding: 9px var(--s3) 9px 0; vertical-align: top;
  color: var(--ink-soft);
}
.doc-body td:first-child { color: var(--ink); }

/* --- footer ------------------------------------------------------------ */
footer { border-top: 1px solid var(--rule); padding: var(--s5) 0 var(--s8); }
footer p {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: var(--ink-faint); margin: 0;
}
footer a { color: var(--accent-text); }

:where(a, summary):focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;

function page(doc, all) {
  const raw = readFileSync(`${SRC}/${doc.file}`, "utf8");
  const lines = raw.split("\n").length;
  const bytes = Buffer.byteLength(raw, "utf8");

  // html: false escapes comments rather than dropping them, so strip first
  const clean = raw.replace(/<!--[\s\S]*?-->/g, "");

  // the docs open with an h1 and, within a few lines, an italic standfirst;
  // the shell renders both, so lift them out of the body. Only a standfirst
  // adjacent to the h1 counts — later `_..._` lines belong to sections.
  const lines0 = clean.split("\n");
  const hIdx = lines0.findIndex((l) => /^#\s+/.test(l));
  const heading = hIdx >= 0 ? lines0[hIdx].replace(/^#\s+/, "") : doc.name;

  let stand = doc.blurb;
  for (let i = hIdx + 1; i < Math.min(hIdx + 5, lines0.length); i++) {
    const m = lines0[i].match(/^_(.+)_$/);
    if (m) {
      stand = m[1];
      lines0[i] = "";
      break;
    }
  }
  if (hIdx >= 0) lines0[hIdx] = "";
  const body = lines0.join("\n");

  const env = {};
  let html = md.render(body, env);
  html = html
    .replace(/<table>/g, '<div class="tablewrap"><table>')
    .replace(/<\/table>/g, "</table></div>");

  const siblings = all
    .map((d) =>
      d.slug === doc.slug
        ? `<span aria-current="page">${esc(d.name)}</span>`
        : `<a href="${d.url ?? "#"}">${esc(d.name)}</a>`,
    )
    .join("");

  const toc = (env.toc ?? [])
    .map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`)
    .join("");

  return `<title>Càrn ${doc.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,100..125,400..900;1,100..125,400..900&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${CSS}</style>

<header class="masthead">
  <div class="wrap">
    <a class="brandmark" href="#top">Càrn</a>
    <nav class="siblings" aria-label="Specification documents">${siblings}</nav>
  </div>
</header>

<main class="wrap" id="top">
  <div class="title">
    <p class="eyebrow">${esc(doc.name)} · docs/${esc(doc.file)}</p>
    <h1 class="doc">${esc(heading)}</h1>
    <p class="blurb">${esc(stand)}</p>
    <p class="provenance">Generated from docs/${esc(doc.file)} · ${lines.toLocaleString("en")} lines · ${bytes.toLocaleString("en")} B · palette lifted from BRAND.md at build time</p>
  </div>

  ${toc ? `<nav class="toc" aria-label="Contents"><p class="eyebrow">Contents</p><ol>${toc}</ol></nav>` : ""}

  <div class="doc-body">${html}</div>
</main>

<footer class="wrap">
  <p>Càrn · AGPL-3.0-or-later · this page is generated from the Markdown, not maintained beside it</p>
</footer>
`;
}

// published artifact URLs, so each page can link its siblings
const urls = {
  plan: "https://claude.ai/code/artifact/bd38dee8-6822-4b2c-a602-bde753e498a3",
  brand: "https://claude.ai/code/artifact/234389d4-5e88-408d-936f-834ecf266f03",
  layout:
    "https://claude.ai/code/artifact/587c7ac1-5712-4927-bb82-8e5a80731f80",
  stack: "https://claude.ai/code/artifact/d6827af7-8151-4e7b-aace-e29617e51f99",
};
for (const d of DOCS) d.url = urls[d.slug];

for (const d of DOCS) {
  const out = `${OUT}/carn-${d.slug}.html`;
  writeFileSync(out, page(d, DOCS), "utf8");
  console.log(
    `${out}  ${Buffer.byteLength(readFileSync(out)).toLocaleString("en")} B`,
  );
}

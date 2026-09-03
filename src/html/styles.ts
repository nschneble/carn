// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash } from "node:crypto";

import { minifyCss } from "./minify-css.js";

function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw({ raw: strings }, ...values);
}

export const tokens = css`:root {
  color-scheme: dark;

  /* ground → surface → sunk */
  --ground: #0e0f0f;
  --surface: #171919;
  --sunk: #1e2121;

  /* ink ramp */
  --ink: #f2f4f4;
  --ink-soft: #c6caca;
  --ink-mid: #8e9494;
  --ink-faint: #828888;

  /* rules */
  --rule: #2b2e2e;
  --rule-soft: #212424;

  /* brand */
  --accent: #ff4d95; /* 6.17:1 on ground, 5.21 on sunk — large type, rules */
  --accent-text: #ff6ea8; /* 7.36:1 on ground, 6.22 on sunk — links, small text */
  --accent-fill: var(--accent); /* the pink a small label sits on — see 02 */
  --accent-wash: #331020;
  --on-accent: #0e0f0f;

  /* diff */
  --diff-add: #7ee08a; /* 9.98:1 on sunk — added lines */
  --diff-del: #cf7848; /* 4.97:1 on sunk — removed lines */

  /* type */
  --f-display: "Carn Sans", "Archivo", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --f-mono: "Carn Mono", "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;

  /* spacing — 4px base */
  --s1: 4px;
  --s2: 8px;
  --s3: 12px;
  --s4: 16px;
  --s5: 22px;
  --s6: 30px;
  --s7: 44px;
  --s8: 62px;
  --s9: 84px;

  --measure: 66ch;
}

@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    --ground: #f4f6f6;
    --surface: #ffffff;
    --sunk: #e9eded;
    --ink: #0e0f0f;
    --ink-soft: #3a3e3e;
    --ink-mid: #5c6261;
    --ink-faint: #666c6b;
    --rule: #dce0e0;
    --rule-soft: #e7eaea;
    --accent: #e7156c;
    --accent-text: #c9105c;
    --accent-fill: var(--accent-text);
    --accent-wash: #fbe2ed;
    --on-accent: #ffffff;
    --diff-add: #1c6e2f; /* 5.36:1 on sunk — added lines */
    --diff-del: #5a1c00; /* 11.12:1 on sunk — removed lines */
  }
}

@media (prefers-contrast: more) {
  /* tripled :root outranks the light block by specificity, not order */
  :root:root:root {
    --rule: var(--ink-mid);
    --rule-soft: var(--ink-faint);
  }
}`;

const faces = css`@font-face {
  font-family: "Carn Sans";
  src: url("/fonts/carn-sans.woff2") format("woff2-variations");
  font-weight: 400 900;
  font-stretch: 100% 125%;
  font-display: swap;
}
@font-face {
  font-family: "Carn Mono";
  src: url("/fonts/carn-mono-400.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Carn Mono";
  src: url("/fonts/carn-mono-500.woff2") format("woff2");
  font-weight: 500;
  font-display: swap;
}`;

export const components = css`body {
  background: var(--ground);
  color: var(--ink);
  font-family: var(--f-display);
  font-variation-settings: "wdth" 100, "wght" 400;
  font-size: 16.5px;
  line-height: 1.62;
  margin: 0;
  -webkit-font-smoothing: antialiased;
}

/* focus */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* utilities */

.vh,
.skip:not(:focus) {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.skip {
  display: inline-block;
  font-family: var(--f-mono);
  font-size: 12px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--ink);
  padding: 14px 18px;
  text-decoration: none;
}

/* type roles */

.t-xl {
  font-variation-settings: "wdth" 118, "wght" 780;
  font-size: clamp(2.5rem, 7.6vw, 5rem);
  line-height: 0.92;
  letter-spacing: -0.035em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.t-l {
  font-variation-settings: "wdth" 115, "wght" 760;
  font-size: clamp(1.75rem, 4.4vw, 2.7rem);
  line-height: 0.97;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.t-m {
  font-variation-settings: "wdth" 110, "wght" 700;
  font-size: 1.14rem;
  letter-spacing: -0.01em;
}

.t-item {
  font-variation-settings: "wdth" 110, "wght" 700;
  font-feature-settings: "case" 1;
  font-size: clamp(1.05rem, 2.5vw, 1.42rem);
  line-height: 1.18;
  overflow-wrap: anywhere;
}

/* a list page's own title, over its own rows: same face and size, tone
   is the only separator — see 02 */
.t-item--title {
  color: var(--ink-soft);
}

.t-body {
  font-variation-settings: "wdth" 100, "wght" 400;
  font-size: 16.5px;
  line-height: 1.62;
}

.t-label {
  font-family: var(--f-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

/* a short explanatory sentence, not a caption — see 03 */
.t-note {
  font-family: var(--f-mono);
  font-size: 11px;
  color: var(--ink-mid);
}

.t-micro {
  font-family: var(--f-mono);
  font-size: 9.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.t-mono {
  font-family: var(--f-mono);
  font-size: 12.5px;
}

/* the whole name at full size; .sc nests inside it for the extension */
.caps {
  text-transform: uppercase;
}

/* compensated small caps (base wght 700, wdth 110) */
.sc {
  text-transform: uppercase;
  font-size: 0.79em;
  font-variation-settings: "wdth" 117, "wght" 824;
  letter-spacing: 0.056em;
  margin-right: -0.056em;
}

/* buttons */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
  font-family: var(--f-mono);
  font-size: 12px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  background: var(--accent-fill);
  color: var(--on-accent);
  border: 1px solid var(--accent-fill);
  padding: 14px 18px;
  text-decoration: none;
  cursor: pointer;
}

.btn--block {
  display: flex;
  width: 100%;
}

.btn--ghost {
  background: none;
  color: var(--ink);
  border-color: var(--ink);
}

.btn:hover {
  filter: brightness(1.08);
}

.btn--ghost:hover {
  background: var(--sunk);
  filter: none;
}

.btn[aria-disabled="true"] {
  background: none;
  color: var(--ink-faint);
  border: 1px dashed var(--rule);
  cursor: not-allowed;
  filter: none;
}

.btn[aria-disabled="true"] .chev {
  display: none;
}

.btn[aria-disabled="true"]:hover {
  background: none;
  filter: none;
}

/* form fields */

.field {
  margin-bottom: var(--s5);
}

.field > label {
  display: block;
  font-family: var(--f-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--ink-mid);
  margin-bottom: var(--s2);
}

.field .box {
  display: block;
  width: 100%;
  box-sizing: border-box;
  background: var(--surface);
  border: 1px solid var(--ink-mid);
  border-radius: 0;
  padding: 13px 15px;
  font-family: var(--f-display);
  font-variation-settings: "wdth" 100, "wght" 400;
  font-size: 15.5px;
  color: var(--ink);
}

.field .box::placeholder {
  color: var(--ink-faint);
  opacity: 1;
}

.field .box--area {
  min-height: 104px;
}

.field .hint {
  font-family: var(--f-mono);
  font-size: 10.5px;
  color: var(--ink-faint);
  margin-top: var(--s2);
}

/* chips */

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}

.chip {
  display: inline-block;
  font-family: var(--f-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  background: var(--sunk);
  border: 1px solid var(--ink-mid);
  border-radius: 999px;
  padding: 8px 15px;
  color: var(--ink-soft);
}

.chip--current {
  background: var(--accent-fill);
  border: 2px solid var(--accent-fill);
  padding: 7px 14px;
  font-weight: 500;
  color: var(--on-accent);
}

/* row tables (list views) */

/* no display value on any table element, and fixed rather than auto: auto
   never sizes a column under its min-content, and a name that does not
   wrap has the whole string as its minimum, so the table outgrows the
   viewport instead of the name ellipsing */
.tbl {
  width: calc(100% + var(--s2));
  margin-left: calc(var(--s2) * -1);
  border-collapse: collapse;
  table-layout: fixed;
}

.tbl th,
.tbl td {
  padding: 0;
  font-weight: inherit;
  text-align: left;
  vertical-align: baseline;
}

.tbl thead th {
  border-bottom: 1px solid var(--ink);
  padding: 0 var(--s4) var(--s2) 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tbl thead .age,
.tbl thead .cnt {
  padding-right: 0;
  text-align: right;
}

.tbl tbody th,
.tbl tbody td {
  border-bottom: 1px solid var(--rule-soft);
}

.tbl thead th:first-child {
  padding-left: var(--s2);
}

/* the gutter bleed sits inside the link, not on the cell, so the whole
   width the wash covers is the width that takes a click */
.tbl tbody th:first-child > *,
.tbl tbody td:first-child > * {
  padding-left: var(--s2);
}

.tbl tbody tr:hover,
.tbl tbody tr:focus-within {
  background: var(--sunk);
}

/* the cell is the target, so the box sits on the child that fills it */
.tbl tbody th > *,
.tbl tbody td > * {
  display: block;
  min-height: 24px;
  padding: 6px var(--s4) 6px 0;
}

.tbl a {
  text-decoration: none;
}

.tbl a:hover,
.tbl a:focus-visible {
  text-decoration: underline;
}

.tbl .nm > * {
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tbl .nm a:focus-visible {
  outline-offset: -2px;
}

.tbl .is-dir .nm > * {
  color: var(--accent-text);
}

.tbl .msg > *,
.tbl .age > * {
  font-family: var(--f-mono);
  font-size: 10px;
  color: var(--ink-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tbl .nm {
  width: 40%;
}

.tbl .age {
  width: 46px;
}

.tbl .age > * {
  padding-right: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* meta blocks (labeled fields on show views) */

.meta {
  display: grid;
  grid-template-columns: 1fr;
  border-top: 1px solid var(--ink);
  margin: 0;
}

@media (min-width: 640px) {
  .meta {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
}

.meta > div {
  padding: var(--s3) var(--s4) var(--s3) 0;
  border-bottom: 1px solid var(--rule);
}

.meta dt {
  font-family: var(--f-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin: 0 0 5px;
}

.meta dd {
  font-size: 13.5px;
  margin: 0;
  color: var(--ink-soft);
  line-height: 1.5;
}

/* state tags */

.tag {
  display: inline-block;
  font-family: var(--f-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 4px 9px;
  background: var(--accent-fill);
  border: 1px solid var(--accent-fill);
  color: var(--on-accent);
}

.tag--quiet {
  background: var(--sunk);
  border-color: var(--sunk);
  color: var(--ink-mid);
}

@media (forced-colors: active) {
  :focus-visible {
    outline-color: Highlight;
  }

  .btn {
    border-color: ButtonText;
  }

  .btn[aria-disabled="true"] {
    color: GrayText;
    border-color: GrayText;
  }

  .chip,
  .tag {
    border-color: CanvasText;
  }

  .chip--current {
    border-color: Highlight;
  }
}`;

export const identity = css`.hdr {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 1;
  object-fit: cover;
}

.mark {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 1;
  height: auto;
  font-variation-settings: normal;
}

.hdr-light {
  display: none;
}

.hdr-dark {
  display: block;
}

@media (prefers-color-scheme: light) {
  .hdr-light {
    display: block;
  }

  .hdr-dark {
    display: none;
  }
}`;

export const source = css`.src {
  background: var(--sunk);
  border: 1px solid var(--rule);
  color: var(--ink);
  font-family: var(--f-mono);
  font-size: 12.5px;
  line-height: 1.55;
  margin: var(--s5) 0 0;
  padding: var(--s3) var(--s4);
  overflow-x: auto;
  tab-size: 2;
}

.src code {
  font-family: inherit;
}

.hljs-comment,
.hljs-quote {
  color: var(--ink-mid);
}

.hljs-addition,
.hljs-attr,
.hljs-attribute,
.hljs-bullet,
.hljs-char,
.hljs-code,
.hljs-deletion,
.hljs-link,
.hljs-literal,
.hljs-number,
.hljs-regexp,
.hljs-selector-attr,
.hljs-selector-pseudo,
.hljs-string,
.hljs-symbol,
.hljs-template-variable,
.hljs-variable {
  color: var(--ink-soft);
}

/* 500 so the distinction survives grayscale and forced-colors */
.hljs-built_in,
.hljs-doctag,
.hljs-keyword,
.hljs-meta,
.hljs-name,
.hljs-section,
.hljs-selector-class,
.hljs-selector-id,
.hljs-selector-tag,
.hljs-tag,
.hljs-title,
.hljs-type {
  color: var(--accent-text);
  font-weight: 500;
}

.hljs-emphasis {
  font-style: italic;
}

.hljs-strong {
  font-weight: 500;
}

.preview {
  display: block;
  max-width: 100%;
  height: auto;
  margin: var(--s5) 0 0;
}

/* the four tones collapse to one here; the weight and the border carry it */
@media (forced-colors: active) {
  .src {
    border-color: CanvasText;
  }

  .diff .d {
    border-left-style: dashed;
  }
}`;

export const pages = css`a {
  color: var(--accent-text);
}

/* page frame */

body > header,
body > main,
body > footer {
  box-sizing: border-box;
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 var(--s5);
}

body > header {
  padding-top: var(--s5);
  padding-bottom: var(--s6);
}

/* inset to the gutters so it matches every rule inside main */
body > footer {
  position: relative;
  border-top: 0;
  margin-top: var(--s8);
  padding-top: var(--s4);
  padding-bottom: var(--s8);
}

body > footer::before {
  content: "";
  position: absolute;
  top: 0;
  left: var(--s5);
  right: var(--s5);
  border-top: 1px solid var(--rule);
}

body > header > p,
body > footer > p {
  margin: 0;
}

main > h1 {
  margin: 0 0 var(--s2);
}

/* repo index */

.empty p {
  max-width: var(--measure);
  margin: 0 0 var(--s4);
  overflow-wrap: anywhere;
}

.empty code {
  overflow-wrap: anywhere;
}

.home {
  color: var(--ink);
  text-decoration: none;
}

.home:hover,
.home:focus-visible {
  text-decoration: underline;
}

/* breadcrumb */

/* one continuous inline run, so the separators are real selectable text
   rather than a gap no Ctrl-F can match */
.crumbs {
  list-style: none;
  margin: 0;
  padding: 0;
  color: var(--ink-mid);
  overflow-wrap: anywhere;
}

.crumbs li {
  display: inline;
}

.crumbs a {
  color: inherit;
  text-decoration: none;
}

.crumbs a:hover,
.crumbs a:focus-visible {
  text-decoration: underline;
}

/* Carn Mono ships two static faces, so the 500 is a weight, not an axis */
.crumbs .here {
  color: var(--ink);
  font-weight: 500;
}

.crumbs .mid {
  display: none;
}

@media (min-width: 640px) {
  .crumbs .mid {
    display: inline;
  }

  .crumbs .fold {
    display: none;
  }
}

/* repo show */

.repo-nav ul {
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  margin: 0 0 var(--s7);
  padding: 0;
}

.repo-nav a {
  display: inline-block;
  font-family: var(--f-mono);
  font-size: 12px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--accent-text);
  text-decoration: underline;
  padding: 10px 14px;
}

/* a submodule is pinned here, not browsable, so the row takes no wash: a
   wash with no click target under it is a false affordance */
.tree .is-sub:hover,
.tree .is-sub:focus-within {
  background: none;
}

.tree .pin > * {
  color: var(--ink-mid);
}

.showall {
  margin: var(--s3) 0 0;
}

/* one commit */

.sha {
  color: var(--ink-faint);
  margin: var(--s2) 0 0;
}

.cmsg {
  font-family: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: var(--measure);
  margin: var(--s4) 0 0;
}

.files {
  margin-top: var(--s6);
}

/* a name and a fixed count, with no subject or age to hold a third
   column, so the name takes the remainder rather than the shared 40% */
.files .nm {
  width: auto;
}

.files .cnt {
  width: 116px;
}

.files .cnt > * {
  padding-right: 0;
  font-family: var(--f-mono);
  font-size: 10px;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}

.dpath {
  color: var(--ink-soft);
  margin: var(--s6) 0 0;
  overflow-wrap: anywhere;
}

/* the tone is a second signal, separating added from removed too */
.diff {
  color: var(--ink-mid);
  margin: var(--s3) 0 0;
}

.diff .a {
  color: var(--diff-add);
  border-left: 2px solid var(--diff-add);
  padding-left: var(--s2);
}

.diff .d {
  color: var(--diff-del);
  border-left: 2px solid var(--diff-del);
  padding-left: var(--s2);
}

.diff .h {
  color: var(--ink-soft);
  font-weight: 500;
}

/* rendered READMEs */

.readme {
  margin-top: var(--s7);
  border-top: 1px solid var(--rule);
  padding-top: var(--s5);
}

.readme > :first-child {
  margin-top: 0;
}

.readme p,
.readme li,
.readme blockquote {
  max-width: var(--measure);
}

.readme h1,
.readme h2,
.readme h3,
.readme h4,
.readme h5,
.readme h6 {
  font-variation-settings: "wdth" 110, "wght" 700;
  letter-spacing: -0.01em;
  line-height: 1.2;
  margin: var(--s6) 0 var(--s3);
}

.readme h1 {
  font-size: 1.6rem;
}

.readme h2 {
  font-size: 1.32rem;
}

.readme h3 {
  font-size: 1.14rem;
}

.readme h4,
.readme h5,
.readme h6 {
  font-size: 1rem;
}

.readme code {
  font-family: var(--f-mono);
  font-size: 0.86em;
}

.readme pre {
  background: var(--sunk);
  border: 1px solid var(--rule);
  padding: var(--s3) var(--s4);
  overflow-x: auto;
}

.readme pre code {
  font-size: 12.5px;
  color: var(--ink);
}

.readme blockquote {
  margin: var(--s4) 0;
  padding-left: var(--s4);
  border-left: 2px solid var(--rule);
  color: var(--ink-soft);
}

.readme img {
  max-width: 100%;
  height: auto;
}

.readme hr {
  border: 0;
  border-top: 1px solid var(--rule);
  margin: var(--s6) 0;
}

.readme table {
  border-collapse: collapse;
  margin: var(--s4) 0;
}

.readme th,
.readme td {
  text-align: left;
  padding: var(--s2) var(--s4) var(--s2) 0;
  border-bottom: 1px solid var(--rule);
  font-size: 14.5px;
}

.readme th {
  font-family: var(--f-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--ink-faint);
  border-bottom-color: var(--ink);
}`;

export const stylesheet = `${faces}\n${tokens}\n${components}\n${identity}\n${source}\n${pages}\n`;

export const servedStylesheet = minifyCss(stylesheet);

// the hash covers what the route sends, not the source it came from: a
// minifier change moves the served bytes without touching a single rule,
// and the url is immutable for a year
export const styleHref = `/carn.${createHash("sha256")
  .update(servedStylesheet)
  .digest("hex")
  .slice(0, 16)}.css`;

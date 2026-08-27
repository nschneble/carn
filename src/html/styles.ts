// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash } from "node:crypto";

export const tokens = `:root {
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
  :root:not([data-theme="dark"]) {
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
  }
}
:root[data-theme="light"] {
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
}
@media (prefers-contrast: more) {
  /* doubled :root outranks the theme selectors above */
  :root:root {
    --rule: var(--ink-mid);
    --rule-soft: var(--ink-faint);
  }
}`;

const faces = `@font-face {
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

export const components = `body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--f-display);
  font-variation-settings:
    "wdth" 100,
    "wght" 400;
  font-size: 16.5px;
  line-height: 1.62;
  -webkit-font-smoothing: antialiased;
}

/* --- focus --- */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* --- utilities --- */
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

/* --- type roles --- */
.t-xl {
  font-variation-settings:
    "wdth" 118,
    "wght" 780;
  font-size: clamp(2.5rem, 7.6vw, 5rem);
  line-height: 0.92;
  letter-spacing: -0.035em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.t-l {
  font-variation-settings:
    "wdth" 115,
    "wght" 760;
  font-size: clamp(1.75rem, 4.4vw, 2.7rem);
  line-height: 0.97;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.t-m {
  font-variation-settings:
    "wdth" 110,
    "wght" 700;
  font-size: 1.14rem;
  letter-spacing: -0.01em;
}
.t-item {
  font-variation-settings:
    "wdth" 110,
    "wght" 700;
  font-feature-settings: "case" 1;
  font-size: clamp(1.05rem, 2.5vw, 1.42rem);
  line-height: 1.18;
}
.t-body {
  font-variation-settings:
    "wdth" 100,
    "wght" 400;
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

/* --- small caps, compensated. base wght 700 / wdth 110 --- */
.sc {
  text-transform: uppercase;
  font-size: 0.79em;
  font-variation-settings:
    "wdth" 117,
    "wght" 824;
  letter-spacing: 0.056em;
  margin-right: -0.056em;
}

/* --- button --- */
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
/* unavailable: form changes, not just colour — the chevron goes */
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

/* --- field --- */
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
  font-variation-settings:
    "wdth" 100,
    "wght" 400;
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

/* --- chip (enum) --- */
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
/* current: weight and border width carry it when the fill is discarded */
.chip--current {
  background: var(--accent-fill);
  border: 2px solid var(--accent-fill);
  padding: 7px 14px;
  font-weight: 500;
  color: var(--on-accent);
}

/* --- row (list item) --- */
.row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 var(--s4);
  padding: 6px var(--s2) 6px 0;
  margin-left: calc(var(--s2) * -1);
  padding-left: var(--s2);
  border-bottom: 1px solid var(--rule-soft);
  align-items: baseline;
}
@media (min-width: 640px) {
  .row {
    grid-template-columns: minmax(0, 1fr) 190px 46px;
  }
}
.row:hover,
.row:focus-within {
  background: var(--sunk);
}
.row .nm {
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row .nm::after {
  content: "";
  position: absolute;
  inset: 0;
}
.row .nm:focus-visible {
  outline-offset: -2px;
}
.row.is-dir .nm {
  color: var(--accent-text);
}
/* lifts the two columns above the row-wide overlay so both stay selectable */
.row .msg,
.row .age {
  position: relative;
  font-family: var(--f-mono);
  font-size: 10px;
  color: var(--ink-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row .age {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* --- meta block (labelled fields on show views) --- */
.meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  border-top: 1px solid var(--ink);
  margin: 0;
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

/* --- state tag --- */
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

export const identity = `.hdr {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 1;
  object-fit: cover;
}
/* body's axis settings are inherited and outrank the mark's own two */
.mark {
  display: block;
  width: 100%;
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

export const pages = `a {
  color: var(--accent-text);
}

/* --- page frame --- */
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
body > footer {
  border-top: 1px solid var(--rule);
  margin-top: var(--s8);
  padding-top: var(--s4);
  padding-bottom: var(--s8);
}
body > header > p,
body > footer > p {
  margin: 0;
}
main > h1 {
  margin: 0 0 var(--s2);
}

/* --- repo index --- */
.repos {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--ink);
}
.empty p {
  max-width: var(--measure);
  margin: 0 0 var(--s4);
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

/* --- repo show --- */
.tree {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--ink);
}
/* no blob view yet, so the row overlay would only block selection */
.tree .nm::after {
  content: none;
}
.tree .row {
  grid-template-columns: minmax(0, 1fr);
}
/* no click target yet, so the hover wash would be a false affordance */
.tree .row:hover {
  background: none;
}
.showall {
  margin: var(--s3) 0 0;
}

/* --- rendered readme --- */
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
  font-variation-settings:
    "wdth" 110,
    "wght" 700;
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

export const stylesheet = `${faces}\n${tokens}\n${components}\n${identity}\n${pages}\n`;

export const styleHref = `/carn.${createHash("sha256")
  .update(stylesheet)
  .digest("hex")
  .slice(0, 16)}.css`;

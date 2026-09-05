<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/234389d4-5e88-408d-936f-834ecf266f03
     is generated from this Markdown by `scripts/docs-artifact.mjs`,
     including the palette. Edit here and run the script to update the
     build artifacts. -->

**BRAND BOOK**

# A design system one-shot

The stylesheet at the top of this file is the deliverable. The theme was originally designed around a dark mode user experience, but a fully architected light mode exists for those who aren't quite as hardcore.

## Tokens

Copy this block verbatim into the stylesheet at `src/html/styles.ts`. Dark is the bare `:root`, and light is the alternate defined inside `prefers-color-scheme: light`. All colors and styles are defined in both locations.

```css
:root {
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
  --accent: #ff4d95; /* 6.17:1 against --ground, 5.21:1 against --sunk */
  --accent-text: #ff6ea8; /* 7.36:1 against --ground, 6.22:1 against --sunk */
  --accent-fill: var(--accent);
  --accent-wash: #331020;
  --on-accent: #0e0f0f;

  /* diff */
  --diff-add: #7ee08a; /* 9.98:1 against --sunk */
  --diff-del: #cf7848; /* 4.97:1 against --sunk */

  /* type */
  --f-display: "Carn Sans", "Archivo", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --f-mono: "Carn Mono", "IBM Plex Mono", "SF Mono", Menlo, monospace;

  /* spacing (4px base) */
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
    --diff-add: #1c6e2f; /* 5.36:1 against --sunk */
    --diff-del: #5a1c00; /* 11.12:1 against --sunk */
  }
}

@media (prefers-contrast: more) {
  /* tripled :root outranks the light block by specificity, not order */
  :root:root:root {
    --rule: var(--ink-mid);
    --rule-soft: var(--ink-faint);
  }
}
```

## Components

Every element in every state.

```css
body {
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
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--ink);
  padding: 14px 18px;
  font-family: var(--f-mono);
  font-size: 12px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
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

/* a short explanatory sentence */
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

/* compensated small caps (base: "wdth" 110, "wght" 700) */
.sc {
  font-variation-settings: "wdth" 117, "wght" 824;
  font-size: 0.79em;
  letter-spacing: 0.056em;
  text-transform: uppercase;
  margin-right: -0.056em;
}

/* buttons */

.btn {
  display: inline-flex;
  background: var(--accent-fill);
  color: var(--on-accent);
  border: 1px solid var(--accent-fill);
  padding: 14px 18px;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
  font-family: var(--f-mono);
  font-size: 12px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}

.btn--block {
  display: flex;
  width: 100%;
}

.btn--ghost {
  background: none;
  border-color: var(--ink);
  color: var(--ink);
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
  margin-bottom: var(--s2);
  color: var(--ink-mid);
  font-family: var(--f-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.field .box {
  display: block;
  box-sizing: border-box;
  width: 100%;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--ink-mid);
  border-radius: 0;
  padding: 13px 15px;
  font-family: var(--f-display);
  font-variation-settings: "wdth" 100, "wght" 400;
  font-size: 15.5px;
}

.field .box::placeholder {
  color: var(--ink-faint);
  opacity: 1;
}

.field .box--area {
  min-height: 104px;
}

.field .hint {
  margin-top: var(--s2);
  color: var(--ink-faint);
  font-family: var(--f-mono);
  font-size: 10.5px;
}

/* chips */

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}

.chip {
  display: inline-block;
  background: var(--sunk);
  color: var(--ink-soft);
  border: 1px solid var(--ink-mid);
  border-radius: 999px;
  padding: 8px 15px;
  font-family: var(--f-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
}

.chip--current {
  background: var(--accent-fill);
  border: 2px solid var(--accent-fill);
  color: var(--on-accent);
  padding: 7px 14px;
  font-weight: 500;
}

/* row tables (list views) */

/* no display values on any table element; fixed not auto */
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

/* gutter bleed sits inside link so the whole wash width is clickable */
.tbl tbody th:first-child > *,
.tbl tbody td:first-child > * {
  padding-left: var(--s2);
}

/* every cell here is a link */
.log tbody tr:hover,
.log tbody tr:focus-within,
.refs tbody tr:hover,
.refs tbody tr:focus-within {
  background: var(--sunk);
}

/* the name is the only link so the wash stays inside the clickable area */
.tree tbody .nm:hover,
.tree tbody .nm:focus-within,
.repos tbody .nm:hover,
.repos tbody .nm:focus-within,
.files tbody .nm:hover,
.files tbody .nm:focus-within {
  background: var(--sunk);
}

/* every cell is a target, so the box sits on the child that fills it */
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
  text-underline-offset: 2px;
}

/* name is link text + row's a11y name, so it wraps not truncates */
.tbl .nm > * {
  color: var(--ink);
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

/* the metadata reads as one right-hand segment, against the name */
.tbl thead .msg,
.tbl .msg > * {
  text-align: right;
}

/* metadata goes below the breakpoint; a subject that is a link stays */
.repos .msg,
.tree .msg {
  display: none;
}

.tbl .age {
  width: 46px;
}

.tbl .age > * {
  padding-right: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@media (min-width: 640px) {
  .repos .msg,
  .tree .msg {
    display: table-cell;
  }

  .tbl .nm {
    width: 65%;
  }
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
  color: var(--ink-soft);
  font-size: 13.5px;
  line-height: 1.5;
  margin: 0;
}

/* state tags */

.tag {
  display: inline-block;
  background: var(--accent-fill);
  border: 1px solid var(--accent-fill);
  color: var(--on-accent);
  padding: 4px 9px;
  font-family: var(--f-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
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
}
```

## 01 · The name

_One rule to read them all_

- **Visual:** **Càrn** for page titles, navs, footers, docs, and the landing page. Anything a person reads where the accent can safely render.
- **ASCII prose:** **Carn** for plain-text READMEs, commit messages, and config comments. Anywhere it's a proper noun but the accent isn't usable.
- **Identifiers:** `carn` for hostnames, binaries, databases, containers, and the repo name. Anything a machine parses. The npm packageis scoped `@nschneble/carn` and the installed binary is `carn`.
- **Never:** `Cairn`. That's the English loanword. Not our name. Never `CARN` as an acronym.
- **Pronounced:** KAARN. Like "barn." Scottish Gaelic for a cairn: a heap that passers-by each add stones to, marking a route for those who follow.

The Montréal rule applies: the accent lives wherever it can and drops wherever a machine has to read it. For example, an accented hostname breaks `git clone` over SSH.

## 02 · Color

_One accent · two ramps · measured contrast to satisfy WCAG_

There's no secondary brand color and no semantic palette. Component state is defined by the accent color, weight, and words.

**Every ratio is measured against all three ground tokens.** The two shown below are the best and worst cases: `--sunk` is the hover and focus wash, so it's always the lightest in dark mode and darkest in light mode. The contract tests assert every pair on `--ground`, `--surface`, and `--sunk`.

### Dark mode

| Token           | Hex     | Ratio                                  |
| --------------- | ------- | -------------------------------------- |
| `--ground`      | #0E0F0F |                                        |
| `--surface`     | #171919 |                                        |
| `--sunk`        | #1E2121 |                                        |
| `--ink`         | #F2F4F4 | 17.39:1 on --ground, 14.69:1 on --sunk |
| `--ink-soft`    | #C6CACA | 11.61:1 on --ground, 9.81:1 on --sunk  |
| `--ink-mid`     | #8E9494 | 6.23:1 on --ground, 5.26:1 on --sunk   |
| `--ink-faint`   | #828888 | 5.33:1 on --ground, 4.50:1 on --sunk   |
| `--accent`      | #FF4D95 | 6.17:1 on --ground, 5.21:1 on --sunk   |
| `--accent-text` | #FF6EA8 | 7.36:1 on --ground, 6.22:1 on --sunk   |

### Light mode

| Token           | Hex     | Ratio                                  |
| --------------- | ------- | -------------------------------------- |
| `--ground`      | #F4F6F6 |                                        |
| `--surface`     | #FFFFFF |                                        |
| `--sunk`        | #E9EDED |                                        |
| `--ink`         | #0E0F0F | 17.70:1 on --ground, 16.27:1 on --sunk |
| `--ink-soft`    | #3A3E3E | 9.99:1 on --ground, 9.18:1 on --sunk   |
| `--ink-mid`     | #5C6261 | 5.74:1 on --ground, 5.27:1 on --sunk   |
| `--ink-faint`   | #666C6B | 4.94:1 on --ground, 4.54:1 on --sunk   |
| `--accent`      | #E7156C | 4.10:1 on --ground, 3.77:1 on --sunk   |
| `--accent-text` | #C9105C | 5.22:1 on --ground, 4.80:1 on --sunk   |

`--ink-faint` is a text color in both themes and clears 4.5:1 on every ground token. It's a tight pass: dark `#828888` measures 4.5001:1 on `--sunk`. Darkening `--sunk`, or laying anything translucent over it would mess everything up.

> **TWO PINKS, SPLIT BY CONTRAST**
>
> The split isn't large elements versus inline text. It's the contrast threshold of **large versus small type**. `--accent` carries anything with a 3:1 ratio, e.g. headline types, rules, focus rings. `--accent-text` carries anything with a 4.5:1 ratio.
>
> This is why **`--accent-text` is used as a fill**. A button label is small text, so the fill behind it needs a 4.5:1 ratio against the label, and in light mode only `--accent-text` delivers it. `--accent-fill` names that choice once in the token block: `var(--accent)` in dark mode, `var(--accent-text)` in light mode. `.btn`, `.tag`, and `.chip--current` are the only components to use it.
>
> **#E7156C measures 4.10:1** against the light ground token. AA for large text (3:1), but short of the 4.5:1 body threshold, and 3.77:1 against `--sunk`. Light mode therefore carries a darkened **#C9105C at 5.22:1** for inline links, small types, and fills.
>
> No single color can clear 4.5:1 against both ground tokens.

### Where we allow the accent

#### Yes

- Directory names in a file list (`-text` variant)
- Focus rings
- Inline links (`-text` variant)
- One layer of a generated wordmark
- Primary buttons, filled
- The chip carrying the current value
- The open/merged state tag

#### No

- Body text of any length
- Gradients of any kind
- Large filled areas or backgrounds
- More than one accented element per screenful
- Success / warning / error as separate hues

There's no green-for-good, red-for-bad palette. A merged PR reads "Merged" and a closed one reads "Closed"; the word carries the state and the fill carries the emphasis. This allows the design to easily adapt to support grayscale and color vision deficiency modes.

## 03 · Type

_Carn Sans + Carn Mono · self-hosted_

Two font families across nine roles. Carn Sans carries identity. Carn Mono carries anything machine-produced.

| Style          | Example                                |
| -------------- | -------------------------------------- |
| .t-xl          | Linklater                              |
| .t-l           | Merge button                           |
| .t-item        | src/components/Button.tsx              |
| .t-item--title | Branches                               |
| .t-m           | Ownership and admins                   |
| .t-body        | Save links now, read them later        |
| .t-label       | Bug/feature                            |
| .t-note        | Showing first 10 lines of 24           |
| .t-micro       | Opened 3 days ago                      |
| .t-mono        | git@carn.fancyenchiladas.net:linklater |

### The rule for the display face

> **ONE SENTENCE RESOLVES EVERY PAGE**
>
> **The display face is worn by whatever the page is about.** On a list, it's the items (filenames, repo names, issue titles, etc). On a show page, it's the name of the thing. On a create page, it's the question being asked. Everything else is mono, small, and quiet.

### List titles

On the file tree, branch/tag lists, and repo index, the <h1> and the rows underneath are both styled with `.t-item`, so `.t-item--title` distinguishes with `--ink-soft` on the title (to contrast `--ink` on the rows).

This doesn't negatively affect the contrast ratios:

- Dark mode `--ink-soft` against `--ground` is **11.61:1**
- Light mode `--ink-soft` against `--ground` is **9.99:1**

Since the `.t-item--title` modifier only applies when a title and its rows would otherwise be difficult to distinguish, it's absent both when nothing sits underneath and when what sits underneath is rendered in Carn Mono.

### Small caps

Carn Sans has no `smcp`, so a row's name column uses compensated synthetic small caps. Browser synthesis also scales the stems, which leaves the faked caps visibly lighter than ones beside them. The whole name always goes in a `.caps` span, uppercased by CSS at full size. Whether anything nests inside that span depends on what data the column is holding.

**A path or a filename splits positionally:** A tree row's entry, a tree or blob heading. This is `pathName()`. The extension, everything from the last dot of the name's final segment, goes in an `.sc` span nested inside the `.caps` span, at 79% size with weight and width raised so the stems match. Case is never read, so `README.md` and `package.json` divide the same way. A name with no dot is all stem and carries no `.sc` span. A leading dot is the extension's own separator, not a stem: `.env` is an empty stem and one `.sc` run carrying `.env` entirely.

**A ref or repo name never splits:** A branch, a tag, the repo index. This is `plainName()`, and it's a separate function: a ref has no extension, so a dot in one is an ordinary character and a slash isn't a path separator. The tag `v1.1.0` is entirely in `.caps`, as are the branch `release/2.0` and the repo `example.com`. `plainName()` emits no `.sc` span under any input.

Both functions follow the markup rules below.

**The rule is the name column, not the filename.** A tree row's filename, a branch or tag's name, a repo's name in the index, e.g. anything sitting in a row's `.nm` slot, takes `.t-item` and small caps together. Two columns carry a name without carrying small caps:

- **The commit log's `.nm` is a short SHA, in `.t-mono`.** A SHA is a machine identifier.
- **The commit page's file list is `.t-mono` throughout.** Its rows carry `+N −N` counts that only align in a monospaced face.

```css
.t-item { font-variation-settings:"wght" 700,"wdth" 110;
          font-feature-settings:"case" 1; }
.caps   { text-transform:uppercase; }
.sc     { text-transform:uppercase; font-size:.79em;
          font-variation-settings:"wght" 824,"wdth" 117;
          letter-spacing:.056em; margin-right:-.056em; }
```

Two rules about the markup. **`lang="en"` goes on the filename element** once and the `.sc` spans inherit it. And **no whitespace between the stem and `.sc` span**: `README<span class="sc">.md</span>` is one word, and a newline or indent inside it becomes a space in the accessible name, clipboard, and find-in-page search. Never give an `.sc` span an `aria-label`. The accessible name comes from the rendered text, so it reads as `README.MD`.

When a font pipeline exists, replace it with **real small caps merged into Carn Sans**; `smcp` and `c2sc` in the face we already ship (instead of a second family). Instantiate the variable font at the base weight and at the compensated one, scale the heavier caps to 79%, re-space them to keep full-size sidebearings, and merge the lookups into the existing GSUB so `kern`, `case`, and `ccmp` survive. Inside the face the CSS collapses to `font-variant-caps: small-caps`, with no spans, no `text-transform`, and no Turkish or ß hazard; a separate family would still need a `font-family` override on every run, plus its own `@font-face`. Small caps are used in one style today, so the drawn glyphs can be static and need no `gvar` deltas.

The license permits the splice; `fonts/README.md` carries the reasoning and the conditions that come with it.

### A note, not a caption

**`.t-label` is a caption class for one to two words.** A `<dt>`, a section heading (like "Files"), a marker (like "Default"). It's 11px, uppercase, and tracked out at 0.11em, which reads fine at that length but turns hostile at sentence length.

**`.t-note` is for short explanatory sentences.** Monospace font, sentence case, `--ink-mid` token, no uppercase or tracking. A truncation notice, a cutoff count, or anything that says *why* a page looks the way it does. Same family + size as `.t-label`, so the two still read as one register; only the caption treatment is gone.

### Fonts are self-hosted

Not from a CDN. The small-caps build means the pipeline exists either way. A third-party font host is an extra DNS lookup and connection, and a page that renders correctly when Google is blocked is a better page. Carn Sans, the axis-clamped Latin subset we ship, is 54 KB.

## 04 · Layout

_Hairlines · one spacing scale · no boxes around content_

- **Spacing:** 4 · 8 · 12 · 16 · 22 · 30 · 44 · 62 · 84. Use `gap`, not margins.
- **Measure:** 66ch for prose. Never wider.
- **Page:** 1160px max, 22px gutters.
- **Content column:** A single centered column at every width.
- **Rules:** 1px. `--rule` between sections, `--rule-soft` between rows, `--ink` under a heading that opens a table, `--ink-mid` around a field or chip, where the hairline is the component's only boundary. Under `prefers-contrast: more` the first two move onto the ink ramp.
- **Radius:** 0 everywhere. Except the chip, which is a full pill.
- **Shadow:** None.
- **Motion:** None. Hover and focus change instantly. Speed is the smoothness.
- **Breakpoints:** The stylesheet has one width query, `min-width: 640px`. Tuffgal captures two, at 375px and 1440px.

**Content is separated by rules, not contained in boxes.** A card with a border around it is almost always a row with a hairline under it.

There were originally designs for a 168px sidebar (above 820px) to accompany the content column, but it got lost in the Phase 1 shuffle. It will be restored in an upcoming design pass.

## 05 · Components

_Six primitives from which everything else is built_

> **THE MODEL**
>
> **Semantic components that own their styles**, composed into templates. Plain CSS, custom properties, one stylesheet, no build step, no framework, and no utility classes in the markup.

### Buttons

> _Derived from a [pre-build mockup](https://claude.ai/code/artifact/4aeac735-1853-4ed6-9f20-a53297098314). The shipped components have now superseded these designs._

Buttons can be solid, ghost, unavailable, or block variants. _The chevron is the only ornamentation, and it only appears when a button action can be taken._

### Unavailable

**This variant changes the form, not just the color.** The fill drops away, the border goes dashed, the label recedes, and the chevron disappears. Since the chevron means "this does something", removing it is a shape signal that survives grayscale and every kind of color vision deficiency mode.

Use `aria-disabled="true"` rather than the `disabled` attribute, so the control stays focusable and a screen-reader user can find it and hear why. Three rules come with it:

- **Always a `<button type="button">`.** `aria-disabled` on an `<a href>` announces the state and then navigates anyway.
- **Point `aria-describedby` at the reason** whenever the page carries one, which per the rule below, it usually does. Hearing that "Merge" is unavailable without hearing why isn't very helpful.
- **The chevron is `aria-hidden="true" focusable="false" fill="currentColor"`.** It's ornamentation, so it stays out of the accessibility tree and tab order, and it recedes with the label.

> **PREFER EXPLAINING OVER DISABLING**
>
> A grayed-out "Merge" tells you nothing. A better component includes a sentence: _"This branch has conflicts in 2 files"_ followed by the commands that fix it. Use the unavailable state when the action is momentarily out of reach, and prose when there's a reason.

### There's no loading state

With no client JS, a form submission is a browser navigation. The button can't change once it's clicked. The tab's spinner is the progress indicator. **So, what stops a double-click on "Merge"?**

> **DOUBLE-SUBMIT IS SAFE BY CONSTRUCTION**
>
> Every mutating form carries the OID it was rendered against, and the server compare-and-swaps against it. Click "Merge" twice and the second request arrives with a stale expected-head, fails the CAS, and renders _"Already merged."_
>
> A ten-line inline script setting `aria-disabled` on submit is permitted as a progressive enhancement.

### Fields

Boxed fields have monospace labels above them. Chips are used for enums with fewer than six options.

The box is a real `<input>` or `<textarea>` with a `<label for>`, and its placeholder is styled with `::placeholder`. Its border is `--ink-mid`. Same for the chip.

### Chips

**Static. No toggles.** The web UI is read-only, so a chip only displays an enum value. No `aria-pressed`, no `cursor: pointer`, no radio group, no script.

The chip carrying the current value takes `.chip--current`, a modifier class rather than an ARIA state. It differs from a plain chip by **weight, border width, and fill** so it's still readily distinguishable in grayscale and forced-color modes.

### Tables

_Anything that looks like a table is a table._ Use accent tokens and trailing slashes for directories. Display up to sixteen rows before truncating with a "Show all" link.

**Every index view is a `<table class="tbl">`:** the file tree, the repo index, the commit log, the branch and tag lists, and the commit page's file list. Each carries a `<caption class="vh">`, a `<thead>` of `<th scope="col">`, and a `<th scope="row">` holding the name. The caption and the header row aren't decoration; with CSS off they're what labels the table and names its columns, which are the terminal-browser and email-client use cases. The name cell is a `<th scope="row">` rather than a `<td>` because it's the row's header, announced alongside every other cell in that row.

**The trailing slash is real text in the DOM**, never `content: "/"`. Generated content can't be selected, isn't found by Ctrl-F, and vanishes with CSS off.

**The wash covers only what's clickable.** `.tbl tbody th > *, .tbl tbody td > *` takes `display: block` and the row's padding, so a cell's own link fills its own cell. Where a row holds three links, e.g. the commit log and the branch and tag lists, all three pointing at the same commit, the row is covered end to end, so the row is the target and `.log tbody tr:hover, .refs tbody tr:hover` wash the whole `<tr>`. It's also why the subject and age can be links, which a whole-row anchor would forbid. When a row holds one link, e.g. the file tree, the repo index, and the commit page's file list, whose remaining columns are plain text, the target is the name cell, and `.tree tbody .nm:hover`, `.repos tbody .nm:hover`, `.files tbody .nm:hover` wash exactly that cell.

**Why not have the wash cover the entire row?** An `::after` at `inset: 0` on the name's link, absolutely positioned against a `position: relative` `<tr>`, so a single link covers the row, doesn't work at all in Safari. A `<tr>` is not a containing block for an absolutely positioned descendant, so the pseudo-element sizes against the initial containing block; the row stays washed wherever the pointer is, and the hit area becomes the viewport. Fixed in WebKit 240961 on 11 April 2026, but not yet widely propagated, though Playwright's bundled WebKit carries the fix. **No containing-block-forcing trick replaces it either.** `clip-path: inset(0)` works but costs intermittent border loss in Safari, and the design relies on hairline rules between rows. Moving the wash onto the cell is the fix, not a different overlay. The focus ring is drawn with `outline-offset: -2px` so it lands inside the cell rather than bleeding into the next column.

**No `display` values that restyle table elements.** Not `grid`, not `flex`, not `block`, not `table`. Not on `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, or `<td>`. Such an override buys nothing table layout doesn't already give, and it's what cost WebKit the native semantics until Safari 17. The block-level boxes above sit on the anchors and spans inside the cells, which aren't table elements.

**Two values are exempt.** Setting `display: none` to hide cells at certain breakpoints, and `display: table-cell` to restore them, is permitted.

**Table layouts are always `fixed`, never `auto`.** Specify columns as fixed or percentage widths. For example, age is 46px, name is 65%, and subject is the rest. Name is not `calc((100% - 46px) * 0.7)`. Yes, this means that it's precise width will vary slightly with screen width, and that's okay.

**Below 640px, drop the middle column on views where it's just metadata.** This affects the file tree and repo index. **The commit log and branch/tag lists always keep their middle columns.** Each list contains links in the middle column that aren't available elsewhere. **The rule is whether the column is reachable elsewhere.**

**Every table cell has content.** Even "empty" ones. A cell without any elements isn't rendered and essentially screws up the layout. `tree-list.ts` and `ref-list.ts` are two places a cell can legitimately be empty, and both contain a bare `<span>`.

The commit page's file list is the one table shape that legitimately diverges from the nom. It's two columns: a name and fixed-width `+N −N` count.

### Meta blocks

It's the same component (with different keys) on every show view:

- **Issues:** Context / Wanted / Epic / Branch
- **PRs:** Source / Target / Strategy / Mergeability
- **Commits:** Author / Parents / Changed / Signed

> Note: Issues and PRs are Phase 3+.

Each view is a `<dl>` of `<div>`-wrapped `<dt>`/`<dd>` pairs. A key isn't a heading: an `<h5>` under a show page's `<h1>` skips three levels and breaks heading order on every one of these views.

### Tags

_Filled for live states, quiet for terminal ones._ No color coding.

Both variants carry a 1px border in their own fill color. The words inside are what carry the state; a tag that loses its fill and keeps its border still reads "Merged."

### Breadcrumbs

_The masthead line, extended._ The wordmark at the top left of each page is the breadcrumb's first segment: `Càrn` on index pages, `Càrn » linklater » src » index.ts` on blobs.

**Ancestors are links styled with `--ink-mid` tokens.** The current segment isn't a link and is styled with a different token and weight. Ancestor links are underlined on hover and focus.

**The separator key is `»`.** It's always real text in the DOM, never `content:`, i.e. the same rule as the directory trailing slash. Each separator has `aria-hidden="true"`, so the a11y name is the path and not the punctuation.

**Every path segment is navigable.** `src` goes to the tree at that path.

**Start truncating segments when you get below 640px.** Always keep the first two segments: Càrn and repo name, and the last two: parent and current segment.

```
# > 640px
Càrn » linklater » apps » web » src » components » ThemeEditor » index.ts

# < 640px
Càrn » linklater » … » ThemeEditor » index.ts
```

The site and repo never drop, nor the current segment or its parent. Everything between collapses to a single ellipsis (`…`) rather than shedding one ancestor at a time as the width narrows.

**Zero JavaScript.** Render every segment and swap which set displays on the media query. The collapsed segments are `display: none`, so they leave the a11y tree along with the layout.

It carries `<nav aria-label="Breadcrumb">` and an ordered list. It doesn't replace the page's `<h1>`.

### Repo nav

_Commits, branches, and tags._ Oh my.

The repo page carries the only way to visit commit logs, branches, and tags. `<nav aria-label="Repo views">` wraps three plain links. `commitsHref` and `refsHref` are the only correct sources for the three URLs.

Each link is `inline-block` with its own padding, not inline text, so it clears the appropriate `target-size`.

**As of Phase 1e, repo nav is only on the repo page**, which means there's never a current page in the nav. A later phase that carries the nav onto the destination pages marks the current entry with `aria-current="page"` and the chip's `.chip--current` precedent, keeping it as an active link, unlike how the breadcrumb unlinks its current segment.

### Focus and utility classes

**There's one `:focus-visible` rule for the whole system:** a 2px `--accent` outline, offset 2px. `--accent` clears 3:1 on all three ground tokens in both themes. **Never write `outline: none`**, anywhere, for anything.

Two utility classes exist: `.vh` is visually-hidden text that stays in the a11y name, such as landmark labels and table captions. `.skip` is similar, but it's designed for the skip link every page opens with. It targets `<main id="main" tabindex="-1">`.

### When the OS overrides the color palette

`forced-colors: active` throws away every color in this file. **This makes the non-color signals all the more vital.**

The last block in the stylesheet covers these:

- Current chip keeps the heavier border
- Focus ring switches to `Highlight`
- Tag keeps the border it carries in its own fill color
- Unavailable button keeps its dashed border and missing chevron

`prefers-contrast: more` is handled in the token block, by raising the two hairlines onto the ink ramp.

## 06 · Repo identity

_A committed image or a generated mark._

### Header image: `.carn/header.svg`

Committed directly to the repo. Versioned, editable by commit, survives migrations, and needs no storage, form, or admin UI.

- **Aspect:** 4:1. Reference size is 1600×400.
- **Format:** SVG. **Prefer transparent backgrounds.**
- **Max size:** 16 KB, derived from the page budget. Above the cap it's ignored and the generated mark is used instead.
- **Processing:** None whatsoever. It's simply served as committed. `object-fit: cover` absorbs any minor mismatches.

> **THE CAP AND PAGE BUDGET, RECONCILED**
>
> Measured as wire bytes at gzip level 5. Fonts count as-is because woff2 is Brotli inside and doesn't compress.
>
> ```
> fonts                 72,300 B
> favicon                4,600 B  one icon, cached site-wide
> page chrome              900 B
> stylesheet, minified   2,700 B
>                      ----------
>                       80,500 B
> ```
>
> Against a 102,400 B (100 KB) page budget, that leaves 21,900 B for the header and page content. A header at the 16 KB cap leaves 5,900 B for the page's own HTML content, and the heaviest repo page (full README, show-all tree) gzips to roughly 2,200 B. **The cap fits, with room.**

### Resolution: per theme slot, first match wins

Two slots, light and dark, each resolving independently. A repo with only a dark header still looks deliberate in light mode.

```
// for each slot in (light, dark), use the first that exists at the default branch tip
// generated wordmark is theme-aware and always available

.carn/header-{slot}.svg
.carn/header.svg
→ generated wordmark
```

If both slots resolve to the same source, e.g. `header.svg`, use a plain `<img>`. Only use `<picture>` when the two slots are genuinely different.

> **`<PICTURE>` IS THE WHOLE MECHANISM**
>
> Càrn follows `prefers-color-scheme` and nothing else. There's no theme cookie or `data-theme` attribute; `<picture>` sees everything. Two committed images become a `<source>` plus an `<img>`; a wordmark in one slot and an image in the other swap via CSS, since `<picture>` can only switch between images. Both paths are zero-JS and always correct.

The resolution needs one `ls-tree` of `.carn/` per repo page; cache it against the default branch's OID and it costs nothing on a warm page. A committed image that exceeds 16 KB is simply ignored.

> **NO RESIZING OR CROPPING**
>
> Image processing means a native dependency, a build step, a cache, and an invalidation strategy. A whole subsystem to avoid exporting at the right size. Commit at 1600×400. Reject what doesn't fit.

### Generated wordmark (the default)

Every repo has an identity. The repo name (always unique) is hashed to a seed; the seed drives layer count, offset vector, per-letter baseline drift, rotation, weight, width, and whether the top layer is filled or outlined. Rendered as an SVG, server-side, and cached by name.

- **Palette:** Two colors and the ground token.
- **Forbidden:** Gradients, drop shadows, bubble outlines, texture, and skew.
- **Long names:** The SVG `viewBox` is fitted to the rendered text, so a mark never overflows, it scales. Above 18 characters, break onto a second line. `wordmark.ts` treats `-`, `_`, and `.` as separators and breaks at whichever one sits nearest the middle of the name.
- **Name cap** 40 characters, as of Phase 1e. It's a typographic bound. It's what the generated mark can still draw legibly. `namePattern` permits 64 today. `docs/LAYOUT.md` §03 owns the enforcement sites.

The mark is theme-aware by construction. It draws from `--accent` and `--ink`, so it inverts automatically.

## 07 · Voice

_Plain, specific, and entirely unbothered._

#### Write

- "Show all 34"
- "Merge · squash"
- "Or just push to it"
- "This branch has conflicts in 2 files"
- "No issues yet"
- "Comment from the CLI: `carn issue comment`"

#### Don't

- "Load more items…"
- "Squash and merge pull request"
- "Oops! Something went wrong"
- "We couldn't process your request"
- "Looks like there's nothing here! 🎉"
- Any exclamation mark, ever

Errors say what happened and what to do, in that order, without apology. Empty states say what could be there and how to make it. Buttons name their action, and the confirmation uses the same verb — _Merge_ then _Merged_, never _Merge_ then _Success_.

On the marketing front, being specific lends to the punk aesthetic: "No sign-ups. No tokens. No private repos. No JavaScript."

## 08 · Design never-evers

_Go immediately to design jail._

| Never ever                         | Because                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Animation or transitions on layout | Motion is what slow sites use to feel fast. Just be fast.                             |
| A dyslexia-friendly font option    | A 2026 meta-analysis of 15 studies and 688 participants found it's minimally helpful. |
| A second brand color               | One accent forces the hierarchy to come from size and weight.                         |
| A utility-class framework          | This system literally exists to avoid class soup in the markup.                       |
| Client JS on the critical path     | A page that needs JavaScript to render a diff is a bug.                               |
| Color as the only signal           | Directories get a slash, diffs get `+` and `−`, states get a word.                    |
| Drop shadows or elevation          | Depth is a box metaphor. This design separates with rules.                            |
| Icon fonts or icon libraries       | Almost none are needed. The few that are get inlined SVGs.                            |
| Rounded corners on content         | Softness fights the type. The chip is the only pill.                                  |
| The display face in body copy      | All-caps removes the ascender/descender profile required for word-shape recognition.  |

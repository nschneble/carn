<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/234389d4-5e88-408d-936f-834ecf266f03
     is generated FROM it by scripts/docs-artifact.mjs, palette included —
     edit here, re-run that. -->

**BRAND BOOK**

# Every decision, in one file

Written in its own system. The stylesheet at the top of this file is the deliverable — copy the token block into Càrn's stylesheet and the components below come with it.

Dark is the default and the theme designed first. Light is a complete alternate, not an afterthought — every token has a value in both, and no colour is defined only inside a media query.

## Tokens

Copy this block verbatim into the stylesheet. Dark is the bare `:root`; light is
the alternate, redefined inside `prefers-color-scheme: light`. No colour is
defined only inside a media query, so both render paths resolve — a token left
only inside the query would be empty under dark, which is the default.

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

Semantic, not utility. The full set.

```css
body {
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
}
```

## 01 · The name

_Two forms, one rule_

- **Visual** — **Càrn** — page titles, nav, footer, docs, the landing page. Anything a person reads where the accent can render.
- **ASCII prose** — **Carn** — plain-text READMEs, commit messages, config comments, anywhere it's a proper noun but the accent can't survive.
- **Identifiers** — `carn` — hostname, binary, database, containers, repo name. Anything a machine parses. The npm package alone is scoped, `@nschneble/carn`; the binary it installs is `carn`.
- **Never** — `cairn`. That's the English loanword, not our name. And never `CARN` as an acronym — it isn't one.
- **Pronounced** — KAARN. Gaelic for a cairn — a heap that passers-by each add one stone to, marking a route for those who follow.

The Montréal rule: the accent lives wherever it can and drops wherever a machine has to type it. An accented hostname breaks `git clone` over SSH — settled, not stylistic.

## 02 · Colour

_One accent · two ramps · measured contrast_

There is no secondary brand colour and no semantic palette — state is carried by the accent, by weight, and by words.

**Every ratio is measured against all three grounds.** The two shown below are the best case and the binding one: `--sunk` is the hover and focus wash, so it sits under a row's text whenever the pointer or the caret is there, and it is always the lightest ground in dark mode and the darkest in light — in both, the one nearest the ink. Quoting a token against `--ground` alone reads it high — by 0.4 in light and up to 1.0 in dark on the tokens near the threshold. The contract test asserts every pair on ground, surface, _and_ sunk.

### Dark — the default

- `--ground` — #0E0F0F
- `--surface` — #171919
- `--sunk` — #1E2121
- `--ink` — #F2F4F4 · 17.39:1 on ground, 14.69:1 on sunk
- `--ink-soft` — #C6CACA · 11.61:1 on ground, 9.81:1 on sunk
- `--ink-mid` — #8E9494 · 6.23:1 on ground, 5.26:1 on sunk
- `--ink-faint` — #828888 · 5.33:1 on ground, 4.50:1 on sunk
- `--accent` — #FF4D95 · 6.17:1 on ground, 5.21:1 on sunk
- `--accent-text` — #FF6EA8 · 7.36:1 on ground, 6.22:1 on sunk

### Light — the alternate

- `--ground` — #F4F6F6
- `--surface` — #FFFFFF
- `--sunk` — #E9EDED
- `--ink` — #0E0F0F · 17.70:1 on ground, 16.27:1 on sunk
- `--ink-soft` — #3A3E3E · 9.99:1 on ground, 9.18:1 on sunk
- `--ink-mid` — #5C6261 · 5.74:1 on ground, 5.27:1 on sunk
- `--ink-faint` — #666C6B · 4.94:1 on ground, 4.54:1 on sunk
- `--accent` — #E7156C · 4.10:1 on ground, 3.77:1 on sunk
- `--accent-text` — #C9105C · 5.22:1 on ground, 4.80:1 on sunk

`--ink-faint` is a text colour in both themes and clears 4.5:1 on every ground in both. It has no headroom to spare: dark `#828888` measures 4.5001:1 on `--sunk`. Darkening `--sunk`, or laying anything translucent over it, breaks the token rather than dimming it.

> **TWO PINKS, SPLIT BY CONTRAST REQUIREMENT**
>
> The split is not large elements versus inline text. It is **large type versus small type**, which is a contrast threshold, not a role. `--accent` carries anything that only owes 3:1 — headline type, rules, the focus ring. `--accent-text` carries anything that owes 4.5:1.
>
> That is why **`--accent-text` used as a fill is correct, not an exception**. A button label is small text, so the fill behind it owes 4.5:1 against the label — and in light mode only `--accent-text` delivers it. `--accent-fill` names that choice once in the token block: `var(--accent)` in dark, `var(--accent-text)` in light. `.btn`, `.tag`, and `.chip--current` use it; nothing else does.
>
> **#E7156C measures 4.10:1** on the light ground — AA for large text (3:1), short of the 4.5:1 body threshold, and 3.77:1 on `--sunk`. Light mode therefore carries a darkened **#C9105C at 5.22:1** for inline links, small type, and fills. Dark needs no split (**#FF4D95 is 6.17:1**, 5.21:1 on `--sunk`); its second token exists so both themes have the same shape.
>
> No single colour can clear 4.5:1 against both grounds — it would need luminance ≤0.165 and ≥0.196 at once. Two tokens are mandatory for any brand colour on any two-theme site.

### Where the accent is allowed

#### Yes

- Directory names in a file list — the `-text` variant. A filename is bold at 16.8px where `.t-item`'s clamp bottoms out, under the 18.66px large-text threshold, so it owes 4.5:1 and `--accent` does not clear it in light
- Inline links (the `-text` variant)
- Primary buttons, filled
- The chip carrying the current value
- One layer of a generated wordmark
- Focus rings
- The open/merged state tag

#### No

- Body text of any length
- Large filled areas or backgrounds
- Success / warning / error as separate hues
- Gradients, of any kind
- More than one accented element per screenful

No green-for-good, red-for-bad palette. A merged PR reads Merged and a closed one reads Closed — the word carries the state, the fill carries the emphasis. That is what makes the design survive greyscale and colour blindness.

## 03 · Type

_Carn Sans variable · Carn Mono · self-hosted_

Two families, eight roles. Carn Sans carries identity; Carn Mono carries anything a machine produced.

- **t-xl · identity** — Linklater
- **t-l · section** — Merge button
- **t-item · list** — src/components/Button.tsx
- **t-m · subhead** — Ownership and admins
- **t-body** — Save a URL, read it later. Self-hosted, and the whole thing is a Compose file.
- **t-label** — Investment range
- **t-micro** — Opened 3 days ago
- **t-mono** — git@carn.fancyenchiladas.net:linklater

### The rule for the display face

> **ONE SENTENCE RESOLVES EVERY PAGE**
>
> **The display face is worn by whatever the page is _about_.** On a list, the items — filenames, repo names, issue titles. On a show page, the single thing you came for. On a create page, the question being asked. Everything else is mono, small, and quiet. There is no third register.

### Small caps

Carn Sans has no `smcp`, so filenames use compensated synthetic small caps: lowercase runs wrapped in a span, uppercased by CSS, at 79% size with weight and width raised so the stems match. Browser synthesis scales the stems too, which leaves the faked caps visibly lighter than the ones beside them.

```
.t-item { font-variation-settings:"wght" 700,"wdth" 110;
          font-feature-settings:"case" 1; }
.sc     { text-transform:uppercase; font-size:.79em;
          font-variation-settings:"wght" 824,"wdth" 117;
          letter-spacing:.056em; margin-right:-.056em; }
```

Measured against drawn small caps: stem 1.004, width 0.870, advance 0.900, height 0.790. Three details are load-bearing — `letter-spacing` stays, because real small caps keep _full-size_ sidebearings; `"case" 1` lifts `. - /` to cap alignment; and the DOM keeps the real lowercase, since `text-transform` is display-only by spec.

Two rules about the markup. **`lang="en"` goes on the filename element**, once — the `<a class="nm">` or whatever carries `.t-item` — and the `.sc` spans inherit it. Under Turkish, `i` uppercases to `İ`. And **no whitespace between a plain run and an `.sc` span**: `README.<span class="sc">md</span>` is one word, and a newline or indent inside it becomes a space in the accessible name, in the clipboard, and in find-in-page. Never give an `.sc` span an `aria-label` — the DOM's true lowercase is already the right accessible name.

When the font pipeline exists, replace all of it with **real small caps merged into Carn Sans** — `smcp` and `c2sc` in the face we already ship, not a second family. Inside the face the CSS collapses to `font-variant-caps: small-caps`; a separate family would still need a `font-family` override on every run, plus its own `@font-face` and its own request on the critical path.

The license permits the splice; `fonts/README.md` carries the reasoning and the conditions that come with it.

### Fonts are self-hosted

Not from a CDN. The small-caps build means the pipeline exists either way; a third-party font host is an extra DNS lookup and connection on the critical path; and a page that renders correctly when Google is blocked is a better page. Carn Sans, the axis-clamped Latin subset we ship, is 54 KB.

## 04 · Layout

_Hairlines · one spacing scale · no boxes around content_

- **Spacing** — 4 · 8 · 12 · 16 · 22 · 30 · 44 · 62 · 84. Use `gap`, not margins.
- **Measure** — 66ch for prose. Never wider.
- **Page** — 1160px max, 22px gutters.
- **Content column** — A single centred column at every width. The 168px sidebar above 820px this line specified was never built and appears nowhere in `styles.ts`; reviving it is a decision, not a rediscovery.
- **Rules** — 1px. `--rule` between sections, `--rule-soft` between rows, `--ink` under a heading that opens a table, `--ink-mid` around a field or a chip, where the hairline is the component's only boundary. Under `prefers-contrast: more` the first two move onto the ink ramp.
- **Radius** — 0 everywhere. The single exception is the chip, which is a full pill.
- **Shadow** — None. Ever.
- **Motion** — None. Hover and focus change instantly. Speed is the smoothness.
- **Breakpoints** — The stylesheet has one width query, `min-width: 640px`. Tuffgal captures **two**, 375 and 1440, which bracket it — a complete test of the only responsive decision the CSS makes. 375 is tuffgal's `mobile`; 1440 is a project override of its `desktop`, which the registry puts at 1280. Four captures per story, once the two colour schemes are counted.

**Content is separated by rules, not contained in boxes.** A card with a border around it is almost always a row with a hairline under it.

## 05 · Components

_Six primitives — everything else composes from these_

> **THE MODEL**
>
> **Semantic components that own their styles**, composed into templates. Plain CSS, custom properties, one stylesheet, no build step, no framework, and no utility classes in the markup.

### Button

> _Pre-build mockup, archived: https://claude.ai/code/artifact/4aeac735-1853-4ed6-9f20-a53297098314 — the shipped components have superseded it._

_Solid, ghost, unavailable, block. The chevron is the only ornament in the system, and it appears only on an action that can be taken._

### Unavailable

**Form changes, not just colour.** The fill drops away, the border goes dashed, the label recedes, and **the chevron disappears**. Since the chevron means "this moves you forward," removing it is a shape signal that survives greyscale, low vision, and every kind of colour blindness. Opacity alone fails all three.

Use `aria-disabled="true"` rather than the `disabled` attribute, so the control stays focusable and a screen-reader user can find it and hear why. Three rules come with it:

- **Always a `<button type="button">`.** `aria-disabled` on an `<a href>` announces the state and then navigates anyway.
- **Point `aria-describedby` at the reason** whenever the page carries one — which, per the rule below, it usually does. Hearing that _Merge_ is unavailable without hearing _why_ is the failure this attribute was chosen to avoid.
- **The chevron is `aria-hidden="true" focusable="false" fill="currentColor"`.** It is ornament, so it stays out of the accessibility tree and out of the tab order, and it recedes with the label rather than staying accent-pink.

> **PREFER EXPLAINING OVER DISABLING**
>
> A greyed-out **Merge** says nothing. Usually the better component is a sentence: _"This branch has conflicts in 2 files"_ followed by the three commands that fix it. Use the unavailable state when the action is momentarily out of reach, and prose when there's a reason worth reading.

### There is no loading state

With no client JS a form submit is a browser navigation — the button cannot change once clicked, and the tab spinner is the progress indicator. Which leaves the real question: what stops a double-click on _Merge_?

> **DOUBLE-SUBMIT IS SAFE BY CONSTRUCTION**
>
> Every mutating form carries the OID it was rendered against, and the server compare-and-swaps against it. Click _Merge_ twice and the second request arrives with a stale expected-head, fails the CAS, and renders _"Already merged"_ — because that is what happened. The mechanism that makes concurrent pushes safe makes fat fingers safe. No token table, no nonce, no disabled button.
>
> A ten-line inline script setting `aria-disabled` on submit is permitted for the confusion, not the danger — the page works identically without it, so it's progressive enhancement rather than a dependency.

### Field

_Boxed fields with the label above in mono. Chips for any enum with fewer than six options — cheaper to hit than a select, and readable without opening anything._

The box is a real `<input>` or `<textarea>` with a `<label for>`, and its placeholder is styled with `::placeholder`, never a class on a mocked-up `<div>`. Its border is `--ink-mid`, not `--rule`: a hairline at 1.2–1.4:1 is fine between sections, but it is the _only_ visual boundary of a text input, and 1.4.11 wants 3:1 for that. Same for the chip.

### Chip

**Static, and never a toggle.** The web UI is read-only, so a chip displays an enum value — it does not select one. No `aria-pressed`, no `cursor: pointer`, no radio group, no script.

The chip carrying the current value takes `.chip--current`, a modifier class rather than an ARIA state. It differs from a plain chip by **weight and border width as well as fill**, because a difference in colour alone fails the greyscale rule and is erased outright by forced-colors mode, which discards the accent and keeps the 2px border.

### Row

_Full-row hit area. Directories in accent with a trailing slash, so the distinction survives greyscale. Sixteen rows before "Show all"._

**The trailing slash is real text in the DOM**, never `content: "/"`. Generated content cannot be selected, is not found by Ctrl-F, and vanishes with CSS off — which is every property the slash exists to have.

**`.nm` is the anchor itself**, not a wrapper around one, and the full-row hit area is its `::after` overlay stretched across the positioned `.row`. Wrapping it would put an `overflow: hidden` ancestor between the link and its focus ring; an element's own `overflow` never clips its own outline, an ancestor's does. The ring is drawn with `outline-offset: -2px` so it lands inside the row instead of bleeding into the next grid column.

`.msg` and `.age` sit above the overlay and stay directly selectable. Clicking the commit subject therefore falls through rather than following the row link — kept deliberately, because in 1e the subject and the age become links to the commit, which a whole-row anchor would make impossible.

### Meta block

_Same component on every show view; only the keys change. Issue: Context / Wanted / Epic / Branch. PR: Source / Target / Strategy / Mergeability. Commit: Author / Parents / Changed / Signed._

It is a `<dl>` of `<div>`-wrapped `<dt>`/`<dd>` pairs. A key is not a heading: an `<h5>` under a show page's `<h1>` skips three levels and breaks heading order on every one of these views at once.

### Tag

_Filled for live states, quiet for terminal ones. No colour coding._

Both variants carry a 1px border in their own fill colour — invisible in either theme, and the thing forced-colors mode has left to draw once it discards the fill. The word inside is what carries the state either way; a tag that loses its fill and keeps its border still reads _Merged_.

### Breadcrumb

_The masthead line, extended. On the index it is one segment._

The wordmark at the top left is the breadcrumb's first segment, not a separate
element: `Càrn` on the index, `Càrn » linklater » src » index.ts` on a blob.
`.t-mono`, at the masthead's own size. Nothing about `/` changes — there,
`Càrn` is the current segment and keeps the treatment it already has.

**Ancestors are links at `--ink-mid`; the current segment is not a link, sits at
`--ink`, and takes `"wght" 500`.** Three signals — colour, weight, and the
absence of a target — because colour alone fails the greyscale rule and is
discarded outright by forced-colors. Ancestors carry `.home`'s existing
affordance: no underline at rest, underlined on hover and focus. That is the
masthead convention, already shipped on the wordmark.

**The separator is `»`, real text in the DOM**, never `content:`. Same rule as
the directory trailing slash and for the same reasons: generated content cannot
be selected, is not found by Ctrl-F, and vanishes with CSS off. Each one takes
`aria-hidden="true"`, so the accessible name is the path and not the punctuation.

**Every path segment is navigable** — `src` goes to the tree at that path. A
breadcrumb whose middle segments are decoration is a worse version of a title.

**Below 640px, keep the first two and the last two.**

```
Càrn » linklater » apps » web » src » components » ThemeEditor » index.ts
Càrn » linklater » … » ThemeEditor » index.ts
```

The site and the repo never drop, and neither does the current segment or its
parent. Everything between collapses to a single `…` at once rather than
shedding one ancestor at a time — a breadcrumb that reflows segment by segment
across a drag is noisier than one with two states.

Zero JS: render every segment and swap which set displays on the media query.
The collapsed segments are `display: none`, so they leave the accessibility tree
along with the layout. **That is the intent, not a concession** — pointer,
keyboard, and screen reader then agree exactly on what exists. A link nobody can
see should not be one only some people can reach, and every one of those
destinations is still one level up in the tree.

It carries `<nav aria-label="Breadcrumb">` and an ordered list. It does **not**
replace the page's `<h1>`: on a repo page that is the `.vh` heading carrying the
repo name, and it is what lets the header image stay decorative.

### Focus, and the two utilities

**One `:focus-visible` rule for the whole system:** a 2px `--accent` outline, offset 2px. `--accent` clears 3:1 on all three grounds in both themes, and the offset puts the ring on the ground rather than on top of a fill it would disappear into. **Never write `outline: none`**, anywhere, for anything.

Two utility classes exist, and they are the only two the markup may use. `.vh` is visually-hidden text that stays in the accessible name — landmark labels, table captions, the word that tells a screen reader which chip is current. `.skip` is the same hiding, released on focus, for the skip link every page opens with; it targets `<main id="main" tabindex="-1">`. They are utilities because there is no component to attach them to, which is also why the list stops at two.

### When the OS overrides the palette

`forced-colors: active` throws away every colour in this file. What has to survive is the non-colour half of each signal, and the block at the end of the stylesheet is where that is spelled out: the unavailable button keeps its dashed border and its missing chevron, the current chip keeps its heavier border, the tag keeps the border it carries in its own fill colour, and the focus ring switches to `Highlight`. `prefers-contrast: more` is handled in the token block instead, by raising the two hairlines onto the ink ramp.

## 06 · Repo identity

_A committed image, or a generated mark_

### Header image — `.carn/header.svg`

Committed to the repo, not uploaded. Versioned, editable by commit, survives migration, and needs no storage, form, or admin UI.

- **Aspect** — 4:1. Reference size 1600 × 400.
- **Format** — SVG. **Transparent background** — it composites on either theme.
- **Max size** — 16 KB, derived from the page budget rather than picked. Above the cap it's ignored and the generated mark is used.
- **Processing** — **None.** Served as committed. `object-fit: cover` absorbs minor mismatch.

> **THE CAP AND THE BUDGET DISAGREE BY ABOUT 6 KB**
>
> Measured: the two font families are 72,308 B and the stylesheet 12,730 B, and the heaviest repo page — full README, show-all tree — is 7,005 B. That is 92,043 B against the 100 KB budget, leaving **10,357 B** for a header. A header at the 16 KB cap puts the page at 108,427 B, roughly 106 KB.
>
> The contract test excludes the committed header from the measured weight, so nothing fails today. **Open question for Nick: is the cap 10 KB, or does the header sit outside the page budget?** Until he says, the cap and the budget disagree by exactly that, and this is the note saying so.

### Resolution — per theme slot, first match wins

Two slots, light and dark, each resolving independently down the same chain — so a repo with only a dark header still looks deliberate in light mode.

```
// for each slot in (light, dark), first that exists at the
// default branch tip

  .carn/header-{slot}.svg
  .carn/header.svg
  → generated wordmark          // always available, theme-aware
```

If both slots resolve to the same source — the common case, one `header.svg` — emit a plain `<img>`. One request, simpler markup. Only emit `<picture>` when the two slots genuinely differ.

> **`<PICTURE>` IS THE WHOLE MECHANISM**
>
> Càrn follows `prefers-color-scheme` and nothing else. There is no theme cookie and no `data-theme` attribute, so `<picture>` sees everything there is to see. Two committed images become a `<source>` plus an `<img>`; a wordmark in one slot and an image in the other swap in CSS, since `<picture>` can only switch between images. Both paths are zero-JS and always correct.

The resolution needs one `ls-tree` of `.carn/` per repo page — cache it against the default branch's OID and it costs nothing on a warm page. A committed image that exceeds 16 KB is ignored, and the chain simply continues past it.

> **NO RESIZING OR CROPPING**
>
> Image processing means a native dependency, a build step, a cache, and an invalidation strategy — a whole subsystem to avoid exporting at the right size. Commit it at 1600 × 400. Reject what doesn't fit rather than transforming it.

### Generated wordmark — the default

Every repo has an identity from the moment it exists. The repo name is hashed to a seed; the seed drives layer count, offset vector, per-letter baseline drift, rotation, weight, width, and whether the top layer is filled or outlined. Rendered as SVG, server-side, cached by name.

- **Palette** — **Two colours and the ground.** The moment a third hue appears it reads as a logo generator.
- **Forbidden** — Gradients, drop shadows, bubble outlines, texture, skew.
- **Long names** — The SVG `viewBox` is fitted to the rendered text, so a mark never overflows — it scales. Above 18 characters, break at a hyphen or word boundary onto a second line rather than letting it become a ribbon.
- **Name cap** — 40 characters. It is a typographic bound, not an identifier one: it is what the generated mark can still draw legibly. `docs/LAYOUT.md` §03 owns the enforcement sites.

The mark is theme-aware by construction — it draws from `--accent` and `--ink`, so it inverts with everything else and never looks wrong in the theme it wasn't designed for.

## 07 · Voice

_Plain, specific, unbothered_

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

Errors say what happened and what to do, in that order, without apology. Empty states say what would be here and how to make one. Buttons name the action, and the confirmation uses the same verb — _Merge_ then _Merged_, never _Merge_ then _Success_.

On the marketing surfaces the register sharpens and the rule holds: **specific is punk, insulting is a competitor slide.** "No sign-ups. No tokens. No private repos. No JavaScript." lands. Naming a rival ages badly on a page still running in three years.

## 08 · Design nevers

_The list that keeps it coherent_

| Never                              | Because                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A second brand colour              | One accent forces hierarchy to come from size and weight, which is what makes the pages read.                                                                                 |
| Rounded corners on content         | Softness fights the type. The chip is the only pill.                                                                                                                          |
| Drop shadows or elevation          | Depth is a box metaphor. This design separates with rules.                                                                                                                    |
| Icon fonts or icon libraries       | Almost none are needed. The few that are get inlined SVG.                                                                                                                     |
| Animation or transitions on layout | Motion is what slow sites use to feel fast. Be fast.                                                                                                                          |
| The display face in body copy      | All-caps removes the ascender and descender profile that word-shape recognition depends on.                                                                                   |
| A "dyslexia-friendly" font option  | A 2026 meta-analysis of 15 studies and 688 participants puts the effect at _g_ = −0.04 (n.s.). Reader controls for size, measure, and line-height help more people, for less. |
| Colour as the only signal          | Directories get a slash, diffs get `+` and `−`, states get a word.                                                                                                            |
| A utility-class framework          | Class soup in the markup is the problem this system exists to avoid.                                                                                                          |
| Client JS on the critical path     | A page that needs JS to render a diff is a bug.                                                                                                                               |

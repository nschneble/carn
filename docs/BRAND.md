<!-- Generated from the Càrn brand book artifact. Source of truth: https://claude.ai/code/artifact/4aeac735-1853-4ed6-9f20-a53297098314 -->

**BRAND BOOK**

# Every decision, in one file

Written in its own system. The stylesheet at the top of this file is the deliverable — copy the token block into Càrn's stylesheet and the components below come with it.

Dark is the default and the theme designed first. Light is a complete alternate, not an afterthought — every token has a value in both, and no colour is defined only inside a media query.

## Tokens

Copy this block verbatim into the stylesheet. Dark is the bare `:root`; light is
the alternate. No colour is defined only inside a media query, so all three theme
states — explicit dark, explicit light, and unstamped system default — resolve.

```css
:root {
  /* ground → surface → sunk */
  --ground: #0e0f0f;
  --surface: #171919;
  --sunk: #1e2121;
  /* ink ramp */
  --ink: #f2f4f4;
  --ink-soft: #c6caca;
  --ink-mid: #8e9494;
  --ink-faint: #6a7070;
  /* rules */
  --rule: #2b2e2e;
  --rule-soft: #212424;
  /* brand */
  --accent: #ff4d95; /* 6.19:1 on ground — large type, fills, rules */
  --accent-text: #ff6ea8; /* 7.39:1 — inline links, small text */
  --accent-wash: #331020;
  --on-accent: #0e0f0f;

  /* type */
  --f-display: "Archivo", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --f-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;

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
    --ground: #f4f6f6;
    --surface: #ffffff;
    --sunk: #e9eded;
    --ink: #0e0f0f;
    --ink-soft: #3a3e3e;
    --ink-mid: #6e7473;
    --ink-faint: #9aa0a0;
    --rule: #dce0e0;
    --rule-soft: #e7eaea;
    --accent: #e7156c;
    --accent-text: #c9105c;
    --accent-wash: #fbe2ed;
    --on-accent: #ffffff;
  }
}
:root[data-theme="light"] {
  --ground: #f4f6f6;
  --surface: #ffffff;
  --sunk: #e9eded;
  --ink: #0e0f0f;
  --ink-soft: #3a3e3e;
  --ink-mid: #6e7473;
  --ink-faint: #9aa0a0;
  --rule: #dce0e0;
  --rule-soft: #e7eaea;
  --accent: #e7156c;
  --accent-text: #c9105c;
  --accent-wash: #fbe2ed;
  --on-accent: #ffffff;
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

/* --- type roles --- */
.t-xl {
  font-variation-settings:
    "wdth" 118,
    "wght" 780;
  font-size: clamp(2.5rem, 7.6vw, 5rem);
  line-height: 0.92;
  letter-spacing: -0.035em;
  text-transform: uppercase;
}
.t-l {
  font-variation-settings:
    "wdth" 115,
    "wght" 760;
  font-size: clamp(1.75rem, 4.4vw, 2.7rem);
  line-height: 0.97;
  letter-spacing: -0.03em;
  text-transform: uppercase;
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
  background: var(--accent);
  color: var(--on-accent);
  border: 1px solid var(--accent);
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
  background: var(--surface);
  border: 1px solid var(--rule);
  padding: 13px 15px;
  font-variation-settings:
    "wdth" 100,
    "wght" 400;
  font-size: 15.5px;
  color: var(--ink);
}
.field .box.ph {
  color: var(--ink-faint);
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
  font-family: var(--f-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  background: var(--sunk);
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 8px 15px;
  color: var(--ink-soft);
  cursor: pointer;
}
.chip[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

/* --- row (list item) --- */
.row {
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row.is-dir .nm {
  color: var(--accent-text);
}
.row .msg,
.row .age {
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
}
.meta > div {
  padding: var(--s3) var(--s4) var(--s3) 0;
  border-bottom: 1px solid var(--rule);
}
.meta h5 {
  font-family: var(--f-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin: 0 0 5px;
}
.meta p {
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
  padding: 5px 10px;
  background: var(--accent);
  color: var(--on-accent);
}
.tag--quiet {
  background: var(--sunk);
  color: var(--ink-mid);
}
```

## 01 · The name

_Two forms, one rule_

- **Visual** — **Càrn** — page titles, nav, footer, docs, the landing page. Anything a person reads where the accent can render.
- **ASCII prose** — **Carn** — plain-text READMEs, commit messages, config comments, anywhere it's a proper noun but the accent can't survive.
- **Identifiers** — `carn` — hostname, npm package, binary, database, containers, repo name. Anything a machine parses.
- **Never** — `cairn`. That's the English loanword, not our name. And never `CARN` as an acronym — it isn't one.
- **Pronounced** — KAARN. Gaelic for a cairn — a heap that passers-by each add one stone to, marking a route for those who follow.

The Montréal rule: the accent lives wherever it can and drops wherever a machine has to type it. An accented hostname breaks `git clone` over SSH — settled, not stylistic.

## 02 · Colour

_One accent · two ramps · measured contrast_

Nine tokens. There is no secondary brand colour and no semantic palette — state is carried by the accent, by weight, and by words.

### Dark — the default

- `--ground` — #0E0F0F
- `--surface` — #171919
- `--sunk` — #1E2121
- `--ink` — #F2F4F4 · 17.4:1
- `--ink-mid` — #8E9494 · 6.3:1
- `--accent` — #FF4D95 · 6.19:1
- `--accent-text` — #FF6EA8 · 7.39:1

### Light — the alternate

- `--ground` — #F4F6F6
- `--surface` — #FFFFFF
- `--sunk` — #E9EDED
- `--ink` — #0E0F0F · 17.4:1
- `--ink-mid` — #6E7473 · 4.9:1
- `--accent` — #E7156C · 4.11:1
- `--accent-text` — #C9105C · 5.22:1

> **TWO PINKS, AND WHY**
>
> **#E7156C measures 4.11:1** on the light ground — AA for large text (3:1), short of the 4.5:1 body threshold. Light mode therefore carries a darkened **#C9105C at 5.22:1** for inline links and small type. Dark needs no split (**#FF4D95 is 6.19:1**); its second token exists so both themes have the same shape.
>
> No single colour can clear 4.5:1 against both grounds — it would need luminance ≤0.165 and ≥0.195 at once. Two tokens are mandatory for any brand colour on any two-theme site.

### Where the accent is allowed

#### Yes

- Directory names in a file list — the only accent on a repo page
- Inline links (the `-text` variant)
- Primary buttons, filled
- The selected chip
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

_Archivo variable · IBM Plex Mono · self-hosted_

Two families, six roles. Archivo carries identity; Plex Mono carries anything a machine produced.

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

Archivo has no `smcp`, so filenames use compensated synthetic small caps: lowercase runs wrapped in a span, uppercased by CSS, at 79% size with weight and width raised so the stems match. Browser synthesis scales the stems too, which leaves the faked caps visibly lighter than the ones beside them.

```
.t-item { font-variation-settings:"wght" 700,"wdth" 110;
          font-feature-settings:"case" 1; }
.sc     { text-transform:uppercase; font-size:.79em;
          font-variation-settings:"wght" 824,"wdth" 117;
          letter-spacing:.056em; margin-right:-.056em; }
```

Measured against drawn small caps: stem 1.004, width 0.870, advance 0.900, height 0.790. Three details are load-bearing — `letter-spacing` stays, because real small caps keep _full-size_ sidebearings; `"case" 1` lifts `. - /` to cap alignment; and the DOM keeps the real lowercase, since `text-transform` is display-only by spec.

When the font pipeline exists, replace all of it with a built **ArchivoSC**. Archivo is OFL with no Reserved Font Name, so splicing in a real `smcp` table is permitted, and the CSS collapses to `font-variant-caps: small-caps`.

### Fonts are self-hosted

Not from a CDN. The small-caps build means the pipeline exists either way; a third-party font host is an extra DNS lookup and connection on the critical path; and a page that renders correctly when Google is blocked is a better page. A Latin subset of Archivo variable is ~30 KB.

## 04 · Layout

_Hairlines · one spacing scale · no boxes around content_

- **Spacing** — 4 · 8 · 12 · 16 · 22 · 30 · 44 · 62 · 84. Use `gap`, not margins.
- **Measure** — 66ch for prose. Never wider.
- **Page** — 1160px max, 22px gutters.
- **Content column** — `minmax(0,1fr)` plus a 168px sidebar above 820px. Single column below.
- **Rules** — 1px. `--rule` between sections, `--rule-soft` between rows, `--ink` under a heading that opens a table.
- **Radius** — 0 everywhere. The single exception is the chip, which is a full pill.
- **Shadow** — None. Ever.
- **Motion** — None. Hover and focus change instantly. Speed is the smoothness.
- **Breakpoints** — 375 · 768 · 1024 · 1440, matching the Tuffgal capture set.

**Content is separated by rules, not contained in boxes.** A card with a border around it is almost always a row with a hairline under it.

## 05 · Components

_Seven primitives — everything else composes from these_

> **THE MODEL**
>
> **Semantic components that own their styles**, composed into templates. Plain CSS, custom properties, one stylesheet, no build step, no framework, and no utility classes in the markup.

### Button

> _Rendered mockup — see the artifact: https://claude.ai/code/artifact/4aeac735-1853-4ed6-9f20-a53297098314_

_Solid, ghost, unavailable, block. The chevron is the only ornament in the system, and it appears only on an action that can be taken._

### Unavailable

**Form changes, not just colour.** The fill drops away, the border goes dashed, the label recedes, and **the chevron disappears**. Since the chevron means "this moves you forward," removing it is a shape signal that survives greyscale, low vision, and every kind of colour blindness. Opacity alone fails all three.

Use `aria-disabled="true"` rather than the `disabled` attribute, so the control stays focusable and a screen-reader user can find it and hear why.

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

### Row

_Full-row hit area. Directories in accent with a trailing slash, so the distinction survives greyscale. Sixteen rows before "Show all"._

### Meta block

_Same component on every show view; only the keys change. Issue: Context / Wanted / Epic / Branch. PR: Source / Target / Strategy / Mergeability. Commit: Author / Parents / Changed / Signed._

### Tag

_Filled for live states, quiet for terminal ones. No colour coding._

## 06 · Repo identity

_A committed image, or a generated mark_

### Header image — `.carn/header.png`

Committed to the repo, not uploaded. Versioned, editable by commit, survives migration, and needs no storage, form, or admin UI.

- **Aspect** — 4:1. Reference size 1600 × 400.
- **Format** — PNG or SVG. **Transparent background** — it composites on either theme.
- **Max size** — 512 KB. Above that it's ignored and the generated mark is used.
- **Processing** — **None.** Served as committed. `object-fit: cover` absorbs minor mismatch.

### Resolution — per theme slot, first match wins

Two slots, light and dark, each resolving independently down the same chain — so a repo with only a dark header still looks deliberate in light mode.

```
// for each slot in (light, dark), first that exists at the
// default branch tip. .svg is preferred over .png.

  .carn/header-{slot}.svg
  .carn/header-{slot}.png
  .carn/header.svg
  .carn/header.png
  → generated wordmark          // always available, theme-aware
```

If both slots resolve to the same source — the common case, one `header.png` — emit a plain `<img>`. One request, simpler markup. Only emit `<picture>` when the two slots genuinely differ.

> **THE THEME TOGGLE BREAKS <PICTURE>**
>
> `<picture>` switches on `prefers-color-scheme` only — it cannot see a `data-theme` attribute. So a viewer whose OS is dark but who toggled the site to light would get the dark header on a light page.
>
> The fix falls out of the architecture. **Theme is a cookie, so the server already knows it.** When the cookie is present, render a plain `<img>` for the resolved theme and skip `<picture>` entirely. When it isn't, emit `<picture>` and let `prefers-color-scheme` decide. Both paths are zero-JS and always correct.

The resolution needs one `ls-tree` of `.carn/` per repo page — cache it against the default branch's OID and it costs nothing on a warm page. A committed image that exceeds 512 KB is ignored, and the chain simply continues past it.

> **NO RESIZING OR CROPPING**
>
> Image processing means a native dependency, a build step, a cache, and an invalidation strategy — a whole subsystem to avoid exporting at the right size. Commit it at 1600 × 400. Reject what doesn't fit rather than transforming it.

### Generated wordmark — the default

Every repo has an identity from the moment it exists. The repo name is hashed to a seed; the seed drives layer count, offset vector, per-letter baseline drift, rotation, weight, width, and whether the top layer is filled or outlined. Rendered as SVG, server-side, cached by name.

- **Palette** — **Two colours and the ground.** The moment a third hue appears it reads as a logo generator.
- **Forbidden** — Gradients, drop shadows, bubble outlines, texture, skew.
- **Long names** — The SVG `viewBox` is fitted to the rendered text, so a mark never overflows — it scales. Above 18 characters, break at a hyphen or word boundary onto a second line rather than letting it become a ribbon.
- **Name cap** — 40 characters, enforced at creation. Long names are a create-view problem, not a rendering one.

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

<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/587c7ac1-5712-4927-bb82-8e5a80731f80
     is generated FROM it by scripts/docs-artifact.mjs — edit here, re-run that. -->

**LAYOUT SPECIFICATION**

# The display face is worn by whatever the page is about

That sentence resolves every page in the product.

On a **list**, it's the items — filenames, repo names, issue titles. On a **show** page, it's the single thing you came for. On a **create** page, it's the question being asked. Everything else is mono, small, and quiet. There is no third register.

Colour, spacing, and component definitions live in the brand book. This document covers the three page shapes — list, show, create — and the repo identity system.

## 01 — TYPE · Filenames in

small caps

_Carn Sans · compensated · self-hosted_

Carn Sans carries the display face throughout. Filenames additionally render in small caps, which collapses the ragged ascender and descender profile of lowercase into a uniform band — calmer to scan, and it buys a tighter line-height than lowercase tolerates.

Carn Sans has no `smcp` table, and browser synthesis is not usable: scaling a capital to 79% scales its stems to 79% too, so the faked small caps read visibly lighter than the full caps beside them in the same word. The stems have to be compensated, which needs the variable axes and server-rendered markup — both of which we have.

```
.t-item {
  font-variation-settings: "wght" 700, "wdth" 110;
  font-feature-settings: "case" 1;      /* lifts . - / to cap height */
}
.sc {
  text-transform: uppercase;            /* DOM keeps real lowercase */
  font-size: .79em;
  font-variation-settings: "wght" 824, "wdth" 117;
  letter-spacing: .056em;
  margin-right: -.056em;                /* cancel trailing space */
}
```

Measured against genuinely drawn small caps: stem 1.004, letterform width 0.870, advance 0.900, height 0.790.

Three details are load-bearing. **`letter-spacing` stays** — real small caps keep their full-size sidebearings rather than scaling them, which is why they look tracked out. **`"case" 1`** raises `. - /` to cap alignment, which a path like `src/components/Button.tsx` needs. And **the DOM keeps the true lowercase**: `text-transform` is display-only by spec, so selection, copy-paste, Ctrl-F, and screen readers all get the real filename. Pin `lang="en"` on filenames — under Turkish, `i` uppercases to `İ`.

> **REPLACE THIS WITH A REAL FONT WHEN THE PIPELINE EXISTS**
>
> Build the caps **into Carn Sans**, as `smcp` and `c2sc` — instantiate the variable font at the base and at the compensated weight, scale the heavier caps to 79%, re-space them to keep full-size sidebearings, and merge the lookups into the existing GSUB so `kern`, `case`, and `ccmp` survive. The CSS then collapses to `font-variant-caps: small-caps` with no spans, no `text-transform`, and no Turkish or ß hazard.
>
> A second family is the alternative and it loses on all three counts: another `@font-face`, another request on the page that already loads Carn Sans, and a `font-family` override on every small-caps run. The one thing that would reopen it is a measurement — if the added glyphs cost more on every page than a standalone file costs on the routes that set small caps. Small caps are used at one style today, so the drawn glyphs can be static and need no `gvar` deltas. See `fonts/README.md` for why the license permits the splice and what conditions come with it.

#### Reference

- **Carn Sans · as-is** — src/components/Button.tsx
- **Browser-synthesized** — src/components/Button.tsx
- **Compensated** — src/components/Button.tsx
- **Drawn, for weight** — src/components/Button.tsx

_Row two is the failure mode: those small caps are lighter than the `B` beside them. Row three is the recipe. Row four is a genuinely drawn small-caps face, shown for stem weight only._

## 02 — LIST VIEW · The items

are the headline

_Sixteen rows · show-all · header image above_

Filenames take the display face. The repo name is a visually hidden `<h1>`: the header image or generated mark carries identity on screen, and `.vh` keeps the name in the accessible name. Directories render in `--accent-text` with a trailing slash, so the distinction survives greyscale. Not `--accent` — a filename is bold at 16.8px where `.t-item`'s clamp bottoms out, under WCAG's 18.66px large-text threshold, so it owes 4.5:1 and light `--accent` measures 4.10:1.

> _Pre-build mockup, archived: https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1 — the shipped pages have superseded it._

- **Default rows** — **16**, then `Show all N →`. The median repo root holds 15 entries with about 8.5 directories, so sixteen shows most trees whole and always reaches files.
- **Hit area** — The full row, with a `--sunk` background on hover and focus. **Not built.** `styles.ts` disables the `::after` overlay and the hover wash on `.tree` until 1e gives a file row somewhere to go; a wash with no click target is a false affordance. Live on the repo index today.
- **Directories** — Accent colour, sorted first, trailing slash always.
- **Right columns** — Last commit subject at 190px, age right-aligned at 46px with tabular numerals. Both mono, both `--ink-faint`. **Not built on the file tree**, whose grid collapses to one column; filling it needs a bounded `git log --name-status` walk, which is 1e's work. Live on the repo index, where the same two columns carry description and creation age.
- **Truncation** — Ellipsis on the filename, never a wrap. Rows stay one line at every breakpoint.

_The same shape serves the repo index at `/`, the issue list, and the PR list — items in the display face, metadata in mono at the right._

## 03 — REPO IDENTITY · A committed image,

or a generated mark

_Every repo has one from the moment it exists_

The header image is `.carn/header.svg`, committed to the repo. No upload form, no blob storage, no admin UI — versioned with the code, editable by commit, and it survives a migration to anywhere else. Resolution walks per theme slot: `header-{slot}.svg` → `header.svg` → the generated mark. Full spec in the brand book.

When no image is committed, the repo name is hashed to a seed and the seed drives layer count, offset vector, per-letter baseline drift, rotation, weight, width, and whether the top layer is filled or outlined. Rendered as SVG server-side, cached by name, drawn only from `--accent` and `--ink` so it inverts with the theme.

> _Pre-build mockup, archived: https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1 — the shipped pages have superseded it._

_Deterministic — the same name always yields the same mark._

- **Palette** — Two colours and the ground. A third hue makes it a logo generator.
- **Forbidden** — Gradients, drop shadows, bubble outlines, texture, skew.
- **Long names** — The `viewBox` is fitted to the rendered text, so a mark scales rather than overflows. Above 18 characters, break at a hyphen, underscore, or dot onto a second line — `wordmark.ts` treats all three as separators.
- **Name cap** — **40 characters.** A typographic bound: it is what the generated mark can still draw legibly, not what the identifier grammar allows. Five sites move together — `namePattern` in `src/repos/resolve.ts`, the `CHECK` in the init migration, the refusal copy, and `BAD_NAME` in `verify-phase-1b.sh:22` and `verify-phase-1c.sh` (check 12 greps that exact string). The length checks need no change: 1b, 1c, and 1d each assert a **65**-character name is refused, which stays true at any lower cap. 1d adds the boundary pair — 40 accepted, 41 refused.

## 04 — SHOW VIEW · One title,

four fields,
a thread

_Issue · PR · commit — one template_

The title takes the display face. Beneath it sits a block of labelled metadata fields, then the discussion. The same component serves all three show views; only the keys change.

> _Pre-build mockup, archived: https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1 — the shipped pages have superseded it._

- **Issue fields** — Context · Wanted · Epic · Branch
- **PR fields** — Source · Target · Strategy · Mergeability
- **Commit fields** — Author · Parents · Changed · Signed
- **Provenance** — `via cli` on every comment. The web is read-only; this teaches the workflow to anyone browsing.

### Conflicts

A PR with conflicts shows the conflicted paths and the conflict type parsed from `merge-tree -z`, followed by the commands that resolve it locally. The merge action renders unavailable — dashed border, no chevron — and the sentence above it carries the reason.

```
CONFLICT (contents)   apps/api/src/merge.ts
CONFLICT (contents)   apps/api/src/status.ts

git fetch origin
git switch 14-conflict-output
git rebase origin/main
```

Conflicts are never resolved in the browser.

## 05 — CREATE VIEW · One question

at a time

_New repo · new issue · new PR — one template_

The prompt is set in the display face at headline size. Fields are boxed with a mono label above; enums with fewer than six options use chips rather than a select. One primary action, one escape hatch.

> _Pre-build mockup, archived: https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1 — the shipped pages have superseded it._

_The second button is not a button. Pushing to a repository that doesn't exist creates it._

- **New repo** — What are you making?
- **New issue** — What's wrong?
- **New PR** — What are you proposing?

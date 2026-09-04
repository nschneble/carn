<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/587c7ac1-5712-4927-bb82-8e5a80731f80
     is generated FROM it by scripts/docs-artifact.mjs — edit here, re-run that. -->

**LAYOUT SPECIFICATION**

# The display face is worn by whatever the page is about

That sentence resolves every page in the product.

On a **list**, it's the items — filenames, repo names, issue titles. On a **show** page, it's the single thing you came for. On a **create** page, it's the question being asked. Everything else is mono, small, and quiet. There is no third register.

Color, spacing, and component definitions live in the brand book. This document covers the three page shapes — list, show, create — and the repo identity system.

## 00 — THE HEAD · Every page

declares three things

_`src/html/page.ts` · one shell, no per-page markup_

`page()` takes `{ title, description, path, main }`. The first three are the
whole head contract; a view that forgets one ships an empty `content=""`, which
is worse than no tag. `errorPage()` takes the same `path` so a 404 and a 503 are
as describable as any other page.

- **`title`** — `"<subject> · Càrn"`, or bare `"Càrn"` on the index. `og:title`
  reuses it verbatim; there is no second title string to keep in step.
- **`description`** — one sentence, no markup, under about 160 characters. On a
  repo page it is the README's opening prose, flattened by `renderPlainText`
  (`src/markdown/render.ts`), cut on a word boundary. A repo with no README says
  so; a repo with no commits says nothing at all. `og:description` and
  `<meta name="description">` are the same string.
- **`path`** — the request path with any query string removed, joined to
  `config.origin` for `og:url`. It is the one absolute URL a page genuinely
  needs: a crawler cannot resolve a relative canonical.

**Absolute URLs belong only where a crawler reads them.** `og:image`,
`twitter:image`, and `og:url` are fetched off-site and must carry
`config.origin`. The icons must not: a favicon is fetched by the browser
rendering the page, and `img-src 'self'` refuses it the moment the serving
origin differs from `CARN_ORIGIN` — which is every local run, every contract
test, and every Tuffgal capture. Icons and the stylesheet are site-relative.

**Four image files, one on the page-load path.** `/images/:image` serves them
with a week's `Cache-Control` and an ETag; `docs/BRAND.md` 06 carries the
arithmetic and the reason only `favicon.png` counts against the 100 KB budget.

## 01 — TYPE · Filenames in

small caps

_Carn Sans · compensated · self-hosted_

Carn Sans carries the display face throughout. A Row's name column — filenames, but also a branch or tag name, a repo name in the index — splits positionally: the stem renders at full size, the extension renders in small caps. BRAND §03 has the split rule and its edge cases. This collapses the ragged ascender and descender profile of the extension into a uniform band — calmer to scan, and it marks where a name ends without touching the stem's weight.

Carn Sans has no `smcp` table, and browser synthesis is not usable: scaling a capital to 79% scales its stems to 79% too, so the faked small caps read visibly lighter than the full caps beside them in the same word. The stems have to be compensated, which needs the variable axes and server-rendered markup — both of which we have.

```
.t-item {
  font-variation-settings: "wght" 700, "wdth" 110;
  font-feature-settings: "case" 1;      /* lifts . - / to cap height */
}
.caps {
  text-transform: uppercase;            /* the stem, full size */
}
.sc {
  text-transform: uppercase;            /* DOM keeps real lowercase */
  font-size: .79em;
  font-variation-settings: "wght" 824, "wdth" 117;
  letter-spacing: .056em;
  margin-right: -.056em;                /* cancel trailing space */
}
```

Three details carry the effect, and **BRAND §03 owns them** along with the measured ratios: `letter-spacing` stays, because real small caps keep full-size sidebearings; `"case" 1` raises `. - /` to cap alignment; and the DOM keeps the true lowercase, so selection, copy-paste, and Ctrl-F get the real filename. §03 also carries the `lang="en"` rule and the plan to replace this whole mechanism with real small caps merged into Carn Sans.

#### Reference

- **Carn Sans · as-is** — src/components/Button.tsx
- **Browser-synthesized** — src/components/Button.tsx
- **Compensated** — src/components/Button.tsx
- **Drawn, for weight** — src/components/Button.tsx

_Row two is the failure mode: those small caps are lighter than the `B` beside them. Row three is the recipe. Row four is a genuinely drawn small-caps face, shown for stem weight only._

## 02 — LIST VIEW · The items

are the headline

_Sixteen rows · show-all · header image above_

Filenames take the display face. The repo name is a visually hidden `<h1>`: the header image or generated mark carries identity on screen, and `.vh` keeps the name in the accessible name. Directories render in `--accent-text` with a trailing slash, so the distinction survives grayscale. Not `--accent` — a filename is bold at 16.8px where `.t-item`'s clamp bottoms out, under WCAG's 18.66px large-text threshold, so it owes 4.5:1 and light `--accent` measures 4.10:1.

The exemption is conditional on the mark. A list view that carries no header image and no generated wordmark has nothing else holding identity, so its `<h1>` is visible and takes the display face at item size — the same treatment §06 gives the blob view, and for the same reason. `.t-label` is a caption class and never a page title; `.t-l` is headline size and belongs to the create view, where one question is the entire page.

A visible title sitting over rows in the same face needs a second separator, since size and casing are both already spent making it a heading. **`.t-item--title` carries the difference in tone**: `color: var(--ink-soft)` on the title, `--ink` on the rows beneath it, no change to size or the display face. `--ink-soft` on `--ground` measures 11.61:1 in dark and 9.99:1 in light — clear of AA (4.5:1) with room to spare at `.t-item`'s size. The tree, the branch and tag lists, and the repo index all take the modifier; a show page's title does not, because nothing under a blob's filename or a commit's subject wears the same face for it to separate from.

> _Pre-build mockup, archived: https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1 — the shipped pages have superseded it._

- **Default rows** — **16**, then `Show all N →`. The median repo root holds 15 entries with about 8.5 directories, so sixteen shows most trees whole and always reaches files.
- **Hit area** — Two shapes, and how many links a row holds decides which. The commit log and the branch and tag lists put a link in all three cells, so each cell's own link fills its own cell: three separately focusable targets, covering the row end to end. Those rows wash `--sunk` across the whole `<tr>`, because the whole `<tr>` takes a click. The file tree, the repo index, and the commit page's file list hold one link, the name — the rest of the row is plain text — so the target is the name cell and the wash is on the name cell too. **The wash covers what is clickable and never more.** A row-wide wash on a row holding one link promises a target that is not there, and reaching for an overlay to make the promise true is what broke this in Safari: `position: relative` on a `<tr>` does not create a containing block there, so the stretched `::after` sized against the viewport instead of the row. WebKit fixed that in April 2026 and no shipping Safari carries the fix, so the pattern is out — not deferred, out. **Live everywhere a row leads somewhere**, which 1e made true of the file tree — file rows link to `/r/:repo/blob/:rev/*`, directory rows to `/r/:repo/tree/:rev/*`. A gitlink name is the one exception and takes no wash; a submodule is pinned rather than browsable, and a wash with no click target is a false affordance.
- **Directories** — Accent color, sorted first, trailing slash always.
- **Table columns** — A `<table class="tbl">` at `table-layout: fixed`: age holds 46px right-aligned with tabular numerals, and the name and the subject split what is left about 70/30, the name taking the larger share. The subject is right-aligned, so a row reads as two segments — a clickable name on the left, metadata on the right. Fixed rather than auto, because auto never sizes a column under its min-content width. One rule for the tree, the commit log, the repo index, and the branch and tag lists — none carries its own override, so a seven-character sha and a twelve-character filename share the same rule without a special case. **Below 640px the file tree and the repo index do not render their description column, and the other three views do render theirs.** At 320px the split would leave it 71px of box and 55px of text, which is nine characters: a stub that reads as a rendering defect rather than as information, and a description is plain text whose file or repo is one tap away regardless. It is `display: none` on the `<th>` and the `<td>`, which removes the cell from the table rather than restyling one that is still there — see the brand book's Table section for why that distinction is the one the no-display rule is actually about. **The commit log and the branch and tag lists are not the same case and are not hidden.** Their middle cell holds the row's link to that commit, so dropping it below the breakpoint leaves a row with no way to open what it names. Below 640px no name width is declared, so those two columns split the remainder evenly; the subject is tight there and reachable, which is the correct trade in that direction. Description and age are both mono, both `--ink-faint`. On the file tree they come from one bounded `git log --name-status` walk per listing, never one per row; a path the bound never reaches renders blank rather than costing a longer walk, and its cells still emit an empty `<span>` so the row keeps its height. Live on the repo index too, where the same two columns carry description and creation age.
- **Truncation** — **The rule is per column now; it used to be one rule for both.** "Ellipsis, never wrap" applied uniformly to the name column and to metadata, and that's what put SC 1.4.12 in tension with the design. The name column never truncates: it is the link text and the row's accessible name, so a lost character is lost function, not lost legibility. It wraps instead — `.t-item` already carries `overflow-wrap: anywhere`, so a name breaks only when it genuinely cannot fit on one line, which ordinary names never do. Under the 1.4.12 spacing overrides a long name takes a second line rather than a cut, and that is the conforming behavior. The description and subject columns keep the ellipsis at every width, with or without the overrides — they truncate identically either way, so the overrides cost them nothing extra, and the full text is elsewhere in the product: a repo's description on its own repo page, a commit's subject on the commit page. Age is fixed-width and always short, so it has no truncation to reason about.

_The same shape serves the repo index at `/`, the issue list, and the PR list — items in the display face, metadata in mono at the right._

## 03 — REPO IDENTITY · A committed image,

or a generated mark

_Every repo has one from the moment it exists_

The header image is `.carn/header.svg`, committed to the repo. No upload form, no blob storage, no admin UI — versioned with the code, editable by commit, and it survives a migration to anywhere else. Resolution walks per theme slot: `header-{slot}.svg` → `header.svg` → the generated mark. Full spec in the brand book.

When no image is committed, the repo name is hashed to a seed and the seed drives layer count, offset vector, per-letter baseline drift, rotation, weight, width, and whether the top layer is filled or outlined. Rendered as SVG server-side, cached by name, drawn only from `--accent` and `--ink` so it inverts with the theme.

> _Pre-build mockup, archived: https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1 — the shipped pages have superseded it._

_Deterministic — the same name always yields the same mark._

The mark's own rules — palette, forbidden effects, and how a long name breaks — are BRAND §06. What this section owns is where the cap is enforced.

- **Name cap** — **40 characters, in 1e.** A typographic bound: it is what the generated mark can still draw legibly, not what the identifier grammar allows. Five sites move together — `namePattern` in `src/repos/resolve.ts`, the `CHECK` in the init migration, **two** pieces of refusal copy (`badRepoName.next` in `src/html/error-page.ts` and `refusals.badName` in `src/ssh/exec.ts`, both of which say "64 characters" today), and `BAD_NAME` in `verify-phase-1b.sh:22` (check 13 greps that exact string). `verify-phase-1c.sh` is not one of them: its `BAD_NAME` mirrors `refusals.badName` in `src/routes/git-http.ts`, which names no number at all. The pattern is an anchor character plus a repeat, so 40 is `{0,39}` — `{0,63}` is a 64-character cap. The length checks need no change: 1b, 1c, and 1d each assert a **65**-character name is refused, which stays true at any lower cap. 1e adds the boundary pair — 40 accepted, 41 refused — and pins the column's collation in the same migration.

## 04 — SHOW VIEW · One title,

four fields,
a thread

_Issue · PR · commit — one template_

The title takes the display face. Beneath it sits a block of labeled metadata fields, then the discussion. The same component serves all three show views; only the keys change.

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

## 06 — BLOB VIEW · The filename

is the title

_The show shape, applied to a file_

A blob page is the show view with a file as its subject, so the ordinary rule applies and the filename takes the display face — visibly, in small caps, as the `<h1>`. Section 02's exemption is conditional: the repo name hides because the header image or generated mark already carries identity on screen. A blob page has no mark, so nothing else carries it and the heading has to. **Blob is one of several pages under that rule, not a lone exception** — tree, the commit log, and branches and tags carry no mark either, and §02 gives all four the same visible `.t-item` treatment.

The path renders through `pathName()`, the same function the file rows use, with `lang="en"` for the same reason. A breadcrumb ends in the filename too; path and title are different registers, not a repetition.

- **Metadata** — Size, Lines, Language, in the meta block. A file that isn't shown carries Size and Type instead.
- **The source block** — `<pre class="src" tabindex="0" role="region" aria-labelledby>`. Never a `<div tabindex="0">` around the `<pre>`, which fails `focus-order-semantics`. The `tabindex` is unconditional: the server cannot know whether the longest line will overflow at the reader's viewport and font metrics, and a scrollable region that cannot be focused fails 2.1.1.
- **No line numbers.** Nothing goes inside `<pre>` but the file's own bytes.
- **Four tones, not a theme.** `--ink` for code, `--ink-soft` for literals, `--ink-mid` for comments, `--accent-text` at `"wght" 500` for keywords and types. Not `--accent`, which misses 4.5:1 in light at code size, and never `--ink-faint`. The weight is what survives grayscale and `forced-colors`, where all four collapse to `CanvasText`.
- **The cap is computed, never a constant.** `remaining = budget − (fonts + served stylesheet + chrome)`, measured as wire bytes at gzip level 5, so it tracks the stylesheet without anyone remembering to move it. The source is cut on a line boundary and then highlighted — cutting the rendered HTML instead would sever a scope's `<span>` and the browser would repair the document by restructuring everything after the cut.
- **The truncation notice is not the escape hatch.** `Showing the first 1,842 lines of 6,310.` renders whenever a file is cut, whether or not `CARN_RAW_ORIGIN` is set. Without it a truncated file at MLP simply stops, with no signal to anyone.
- **Escape hatches are absent, not disabled.** With no raw origin configured the link is not rendered at all. `aria-disabled` is a button pattern and has no place on an `<a>`.
- **Inline preview is raster only** — PNG, JPEG, GIF, WebP, served first-party from the content-addressed asset route under `img-src 'self'`. An SVG is repo-controlled markup whose `<title>` would enter this page's accessibility tree, so it renders as source like any other text. The image carries `alt=""` and **no `loading="lazy"`**: nothing server-side can compute a committed image's dimensions, so no `width`/`height` can be emitted, and a lazily loaded image without them shifts the layout when it lands.

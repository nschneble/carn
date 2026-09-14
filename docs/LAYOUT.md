<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/587c7ac1-5712-4927-bb82-8e5a80731f80
     is generated from this Markdown by `scripts/docs-artifact.mjs`. Edit
     here and run the script to update the build artifacts. -->

**LAYOUT SPECIFICATION**

# The display face is used for the page intent

On a **list**, it's the items (filenames, repo names, issue titles, etc). On a **show** page, it's the name of the thing. On a **create** page, it's the question being asked. Everything else is mono, small, and quiet.

Color, spacing, and component definitions live in the [brand book](docs/BRAND.md). This document covers the three page types: list index, show, create, as well as the repo identity system.

## 00 · THE HEADER

_`src/html/page.ts` · one shell · no per-page markup_

`page()` takes `{ title, description, path, main }`. The first three are the whole header contract. `errorPage()` takes the same `path` so 404s and 503s are just as describable as any other page.

Every page declares three things:

- **`title`:** `"[SUBJECT] · Càrn"`, or a plain `"Càrn"` on the index page. `og:title` reuses it verbatim.
- **`description`:** One sentence, no markup, max 160 characters. On a repo page, it's the README's opening prose, flattened by `renderPlainText` (`src/markdown/render.ts`), cut on a word boundary. `og:description` and `<meta name="description">` are the same string.
- **`path`:** The request path without the query string, joined to `config.origin` for `og:url`.

**Absolute URLs are only for crawlers.** `og:url`, `og:image`, and `twitter:image` are fetched off-site and must include `config.origin`. Icon and stylesheet URLs are all relative.

**Five image files, but only one is loaded automatically.** `/images/:image` serves them with a week's `Cache-Control` and an ETag. BRAND §06 carries the arithmetic and the reasoning why only `favicon.png` counts against the page budget.

## 01 · TYPE

_Carn Sans · compensated · self-hosted_

Carn Sans carries the display face. A row's name column (e.g. filenames, branch/tag names, repo names) splits positionally: the stem renders at full size and the extension renders in small caps. BRAND §03 has the split rule and its edge cases. This collapses the ragged ascender/descender profile of the extension into a uniform band.

Carn Sans has no `smcp` table, and browser synthesis isn't usable: scaling a capital to 79% scales its stems to 79% too, so the faked small caps read visibly lighter than the full caps beside them. The stems have to be compensated, which needs variable axes and server-rendered markup.

```css
.t-item {
  font-variation-settings: "wght" 700, "wdth" 110;
  font-feature-settings: "case" 1;
}

.caps {
  text-transform: uppercase;
}

.sc {
  text-transform: uppercase;
  font-variation-settings: "wght" 824, "wdth" 117;
  font-size: 0.79em;
  letter-spacing: 0.056em;
  margin-right: -0.056em;
}
```

These three details carry the "filenames in small caps" effect, **defined in BRAND §03** along with the measured ratios. True small caps keep full-size sidebearings, hence the `letter-spacing`. `font-feature-settings: "case" 1;` raises `.-/` to cap alignment. The DOM keeps the true lowercase text, so selections, clipboard actions, and finds all work against the real names.

## 02 · LIST VIEW

_Sixteen rows · show-all · header image above_

Filenames use the display font face. The repo name is a visually hidden `<h1>`: the header image or generated mark carry the page identity on screen, and `.vh` keeps the name accessible. Directories render in `--accent-text` with a trailing slash.

A list view without a header image or generated mark has no page identity, so its `<h1>` is visible and takes the display font face at item size. This is the same treatment §06 gives the blob view. `.t-label` is a caption class and never a page title. `.t-l` is headline size and belongs to a page whose whole content is one statement: the error page today, the create view when it lands.

Visible titles over item rows with the same look-and-feel need additional differentiation, hence `.t-item--title`. The file tree, branch/tag lists, and repo index page all utilize the modifier. A show page's title doesn't though, because there's nothing under a blob's filename or a commit's subject that needs distinction.

> _Derived from a [pre-build mockup](https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1). The shipped components have now superseded these designs._

The items are the headline:

- **Default rows:** **16**, then `Show all [N] →`. The median repo root holds ~15 entries with 8-9 directories, so sixteen shows most file trees whole and always reaches the files.
- **Hit area:** Comes in two flavors. The commit log and branch/tag lists have links in all three column cells. Each cell's link fills its own cell, so there's three separately focusable targets. These rows wash `--sunk` across the whole `<tr>`. The file tree, repo index, and commit page's file list have one link per row, the name, and the rest of each row is plain text. The target is the name cell and the wash only covers that cell's clickable area. File rows link to `/r/:repo/blob/:rev/*` and directory rows link to `/r/:repo/tree/:rev/*`. The only exception is a gitlink name; a submodule is pinned and isn't browsable.
- **Directories:** Accent color, sorted first, with a trailing slash.
- **Table columns:** A `<table class="tbl">` at `table-layout: fixed` with columns widths as simple pixels and percentages. **Below 640px, the file tree and repo index page don't render their description column.**
- **Truncation:** Per column rules. The name column never truncates; it always wraps and breaks only when it genuinely can't fit on one line, which is rare. Metadata columns, such and description and subject, always truncate with ellipses.

_The repo index page and issue/PR lists are styled identically: items in the display font face, metadata in monospace fonts on the right side._

## 03 · REPO IDENTITY

Whether it's a committed image or a generated mark, **every repo has one from the moment it exists**.

The committed header image is stored at `.carn/header.svg`. There's no file upload, no blob storage, and no admin UI; it's versioned with the codebase, editable by commit, and survives migrations.

Pages check for theme-specific variants before falling back to the generic header, and if that's unavailable, the generated mark: `header-{slot}.svg` → `header.svg` → generated mark. Full spec in the [brand book](docs/BRAND.md).

When no image is committed, the repo name is hashed to a seed and the seed drives layer count, offset vector, per-letter baseline drift, rotation, weight, width, and whether the top layer is filled or outlined. Rendered as an SVG server-side, cached by name, and drawn only with the `--accent` and `--ink` tokens so it naturally inverts with the selected theme.

> _Derived from a [pre-build mockup](https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1). The shipped components have now superseded these designs._

_The generated mark is deterministic; the same name always yields the same mark._ The mark's own rules: palette, forbidden effects, how a long name breaks, etc. are in BRAND §06.

**Name cap:** 40 characters, as of Phase 1e. It's a typographic bound, i.e. it's what the generated mark can still draw legibly, not what the identifier grammar allows.

Enforced in five locations:

- `badRepoName.next` in `src/html/error-page.ts`
- `BAD_NAME` in `scripts/verify/phase-1b.sh`
- `CHECK` in the init migration
- `namePattern` in `src/repos/resolve.ts`
- `refusals.badName` in `src/ssh/exec.ts`

Additionally, some of the phase verify scripts read and/or enforce a cap.

## 04 · SHOW VIEW

_Issue · PR · commit · one template_

One title, four fields, and a thread. The title uses the display font face. Beneath it sits a block of labeled metadata fields, then the discussion. The same component serves all three show views; only the keys change.

> _Derived from a [pre-build mockup](https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1). The shipped components have now superseded these designs._

- **Issue fields:** Context · Wanted · Epic · Branch
- **PR fields:** Source · Target · Strategy · Mergeability
- **Commit fields:** Author · Parents · Changed · Signed
- **Provenance:** `via cli` on every comment. The web is read-only; this teaches the workflow to anyone browsing.

### Conflicts

A PR with conflicts shows the conflicted paths and the conflict type parsed from `merge-tree -z`, followed by the commands that resolve it locally. The merge action renders as unavailable.

```
CONFLICT (contents)  apps/api/src/merge.ts
CONFLICT (contents)  apps/api/src/status.ts

git fetch origin
git switch 14-conflict-output
git rebase origin/main
```

Conflicts are never resolved in the browser.

## 05 · CREATE VIEW

_New repo · new issue · new PR · one template_

One question at a time. The prompt is set in the display font face at headline size. Fields are boxed with a monospace label above; enums with fewer than six options use chips rather than selects. One primary action, one escape hatch.

> _Derived from a [pre-build mockup](https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1). The shipped components have now superseded these designs._

_The second button isn't a button. Pushing to a repository that doesn't exist creates it._

- **New repo:** What're you making?
- **New issue:** What's wrong?
- **New PR:** What're you proposing?

## 06 · BLOB VIEW

_The show shape, applied to files_

A blob page is the show view with a file as its subject; the filename is rendered in the display font face, visibly in small caps, as the `<h1>`. The file tree, commit log, and branches/tags carry no mark either, and §02 gives all four the same visible `.t-item` treatment.

The path renders through `pathName()`, the same function the file rows use. A breadcrumb ends in the filename.

- **Metadata:** Size, lines, and language in the meta block. A file that isn't shown carries size and type instead.
- **The source block:** `<pre class="src" tabindex="0" role="region" aria-labelledby>`. Never a `<div tabindex="0">` around the `<pre>`, which fails `focus-order-semantics`. The `tabindex` is unconditional. The server can't know whether the longest line will overflow at the reader's viewport and font metrics, and a scrollable region that can't be focused fails 2.1.1.
- **No line numbers.** Nothing goes inside `<pre>` but the file's own bytes.
- **Four tones.** `--ink` for code, `--ink-soft` for literals, `--ink-mid` for comments, and `--accent-text` at `"wght" 500` for keywords and types. Not `--accent`, which misses 4.5:1 in light mode at code size, and never `--ink-faint`.
- **The cap is computed.** `Remaining bytes = budget − (fonts + served stylesheet + chrome)`, measured as wire bytes at gzip level 5. The source is cut on a line boundary and then highlighted; cutting the rendered HTML would sever a scope's `<span>` and the browser would repair the document by restructuring everything after the cut.
- **The truncation notice isn't the escape hatch.** `Showing the first [M] lines of [N]` renders whenever a file is cut, regardless of whether `CARN_RAW_ORIGIN` is set. Without it, a truncated file (at MLP) stops at the preview.
- **Escape hatches are absent, not disabled.** With no raw origin configured, the link isn't rendered. `aria-disabled` is a button pattern and shouldn't be used on an `<a>`.
- **Inline preview is raster only:** GIF, JPEG, PNG, and WebP are served first-party from the content-addressed asset route under `img-src 'self'`. An SVG is repo-controlled markup whose `<title>` would enter this page's a11y tree, so it renders as source like any other piece of text. Images carry `alt=""` and **no `loading="lazy"`**: nothing server-side can compute a committed image's dimensions, so `width`/`height` can't be specified, and a lazily loaded image without them shifts the layout when it loads.

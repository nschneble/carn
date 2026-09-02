# Phase 1e · PR revision, round one

_Nick did a visual pass over the six new routes against `npm run visual:seed`.
The views work. The finish does not — and the failures are systemic, not
scattered, which is why this is one document rather than a list of nits._

**The baselines have not been reviewed, deliberately.** Every item below moves
pixels, so every item invalidates a capture. Reviewing baselines first and
fixing after would spend the review twice. Land this, re-shoot once, then the
baseline review is a review of something worth approving.

Read `.claude/CLAUDE.md` in full, then `docs/BRAND.md`, `docs/LAYOUT.md`,
`docs/PLAN.md` §§ on the blob and raw origin. Two sections of `.claude/CLAUDE.md`
govern this work directly: **Nick's edits are not review findings**, and
**Phase size**.

Three things this document is not asking for, so they don't get invented on
the way past:

- **Line numbers in the blob view.** `docs/LAYOUT.md:187` — "No line numbers.
  Nothing goes inside `<pre>` but the file's own bytes." Working as specified.
- **A `Show entire file` link.** `docs/PLAN.md:312` defers the raw origin to
  Phase 2 and gates the hatch on `CARN_RAW_ORIGIN`; `docs/LAYOUT.md:190-191`
  says the truncation notice is deliberately not an escape hatch, and that with
  no origin configured the link is absent rather than disabled. Working as
  specified.
- **`noTreeRoot`.** `/r/:repo/tree/:rev/` erroring is deliberate and commented
  at `src/routes/repo-page.ts:215-217`. Item 7 makes its sibling
  `/r/:repo/tree/:rev` behave the same way instead of returning JSON.

**Doc order matters.** Items 1 and 8 add or change a section in `docs/LAYOUT.md`
and `docs/BRAND.md`. Write the doc, then the markup — not the reverse, and not
both at once. `docs/BRAND.md` and `docs/LAYOUT.md` regenerate through
`scripts/docs-artifact.mjs`; run it after each doc edit.

---

# Part A · The header and list system

This is the whole of Nick's "the general vibe is correct, but so much of the
finesse is off." Do it first: items 2 to 4 touch every new view, and every
later item is cosmetically downstream of them.

## 1 · `docs/LAYOUT.md` §02 has no rule for a list view without a mark

§02 says a list view's `<h1>` is `.vh`, and gives the reason: the header image
or generated mark already carries identity on screen. **That condition holds on
exactly one page.** `/r/:repo` has a mark. Tree, commit log, branches and tags
do not, so §02's rule doesn't reach them, no section replaces it, and each of
the four invented a heading. The measured result:

| View | `<h1>` class | Renders as |
|---|---|---|
| `/r/:repo` | `.vh` | hidden |
| blob | `.t-item` | 1.05–1.42rem, small caps |
| tree | `.t-label` | 11px mono, `--ink-faint`, raw path, no `smallCaps()` |
| commit log | `.t-label` | 11px mono |
| commit | **`.t-l`** | **1.75–2.7rem uppercase, `"wght" 760`** |
| branches, tags | `.t-label` | 11px mono |

Four treatments across six pages, with a 2.7rem display heading on one page and
an 11px faint caption on the page beside it.

**Add to §02, as its own paragraph after the `.vh` rule:**

> The exemption is conditional on the mark. A list view that carries no header
> image and no generated wordmark has nothing else holding identity, so its
> `<h1>` is visible and takes the display face at item size — the same
> treatment §06 gives the blob view, and for the same reason. `.t-label` is a
> caption class and never a page title; `.t-l` is headline size and belongs to
> the create view, where one question is the entire page.

Say in §06 that the blob view is now one of several pages under that rule
rather than a lone exception, and keep §06's own paragraph — the small-caps
part is still specific to filenames.

## 2 · One heading treatment: `.t-item` on all six

`.t-item` everywhere a page title is visible. Concretely:

- `src/html/tree-page.ts` — `.t-label` → `.t-item`, and run the path through
  `smallCaps()` as `src/html/blob-page.ts:124` already does. It is a path; it
  gets the path treatment.
- `src/html/commit-log.ts` — `.t-label` → `.t-item` on `Commits on ${ref}`.
- `src/html/ref-list.ts` — `.t-label` → `.t-item` on `Branches` / `Tags`.
- `src/html/commit-page.ts:203` — **`.t-l` → `.t-item`** on the commit subject.

**`smallCaps()` applies to path-shaped headings only** — blob and tree. Prose
headings (`Commits on main`, `Branches`, a commit subject) render plain.
`.t-item` already sets `"case" 1`, which is what a path needs for `. - /`; a
sentence is unharmed by it.

Leave alone, so they don't get swept up:

- `<h2 class="t-label">Files</h2>` on the repo page. A section heading inside a
  page is not a page title, and `.t-label` is right for it.
- `.t-label` on the truncation notices (`Showing the first …`). Same reason.
- The repo page's `<h1 class="vh">`. It has a mark; §02's condition holds.

Axe's `best-practice` set pins one `<h1>` per page. None of this changes the
count — check that it still doesn't.

## 3 · Tree's heading currently repeats its own breadcrumb in a different voice

With item 2 applied, `/r/gantry/tree/main/apps/web/src` reads
`Càrn » gantry » apps » web » src` in mono, then `APPS/WEB/SRC` in small caps.
§06 already blesses this for the blob view — "path and title are different
registers, not a repetition" — and the same defence holds here, so **keep both
and let the register carry it.** Do not shorten the heading to the last segment:
the `<title>` and the `og:title` use the full path, and a heading that
disagrees with the tab is worse than one that agrees with the crumb.

## 4 · Branches and tags drop the table and adopt the Row component

`src/html/ref-list.ts` is the only list in the product built as
`<table>` + `<thead>`, the only one with visible column headers, and one of two
where the subject and age cells are links. The tree, log and commit file list
are all `<li class="row">`. `docs/BRAND.md:676` specifies the Row component and
BRAND is the authority.

The comment at the top of `ref-list.ts` gives the reason it went its own way —
`position: relative` on a `<tr>` is patchy in WebKit, so a row-wide `::after`
overlay could not be drawn. **Converting to `<li>` removes that problem rather
than colliding with it**, which is the thing to notice before rewriting the
comment.

Convert to the log's shape exactly:

```html
<li class="row">
  <a class="nm t-item" href="…">main<span class="t-micro"> Default</span></a>
  <a class="msg" href="…">Stand the gantry up</a>
  <a class="age" href="…"><span class="vh">Updated </span><time datetime="…">2mo</time></a>
</li>
```

- `<thead>` goes. The columns were named by header cells; they are now named by
  visually hidden text inside the cells, which is what the log does at
  `src/html/commit-log.ts:44`. Give `.msg` the same treatment the age gets —
  `<span class="vh">Subject </span>` — so the accessible name survives the
  table's removal rather than being quietly dropped with it.
- `.refs` styling in `src/html/styles.ts:865-928` goes with the markup. The
  `.row` rules already cover hover, hit area and alignment.
- **Keep the empty-cell guard.** `subject()` at `ref-list.ts:45` renders a bare
  cell when a commit message is empty, because a link with no text has no
  accessible name. The `<li>` form needs the same guard — a bare `<span
  class="msg"></span>`, matching how `tree-list.ts:44` handles an untouched
  entry.
- Keep `refListPage`'s halving loop unchanged. It measures whatever `document()`
  renders and does not care what the markup is.

Once this lands, `.msg`/`.age` hover behaviour is identical across log and
refs, and the tree — whose `.msg`/`.age` are `<span>`s, correctly, since a tree
row's whole target is the file — is the only one that doesn't underline. That
difference is meaningful and stays.

## 5 · `.meta` orphans its last field at narrow widths

`src/html/styles.ts:416` is `repeat(auto-fit, minmax(150px, 1fr))` with no
responsive rule anywhere. Below ~640px it resolves to two columns; the blob
view's three fields put `Language` alone in column 1 at half width. It does not
stretch — `auto-fit` collapses a column only when that column receives no items
anywhere in the grid, and here both columns are occupied. What reads as broken
is `.meta > div`'s `border-bottom`, which draws across half the page while
`.meta`'s own full-width `border-top` sits above it.

Match the file's existing convention — every other responsive rule in
`styles.ts` is a `min-width: 640px` block:

```css
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
```

Below 640px an orphan is unexpressible. At 640px and up the content column
affords four 150px tracks, so the blob's three fields leave column 4 genuinely
empty — that one does collapse — and the three stretch to fill one row. The
commit page's four fields fill it exactly.

`.meta` is BRAND's Meta block (`docs/BRAND.md:686`). If the `.meta` rules sit
inside the component fence that `test/contract/tokens.contract.ts` asserts
verbatim, the BRAND fence changes with the stylesheet, byte for byte. Check
before editing.

---

# Part B · The diff component

## 6 · Added and removed lines are the same colour

`src/html/styles.ts:853` — `.diff .a, .diff .d { color: var(--ink); }`. Both.
The comment above it says "the + and the − carry direction; the tone is only
the second signal," but there is no second signal: the tone separates changed
from unchanged and nothing separates added from removed. The comment describes
an intent the rule does not implement.

**Two new tokens**, `--diff-add` and `--diff-del`. Constraints, all of which
are enforced or enforceable:

- Declared in **both** palettes. `tokens.contract.ts` asserts
  `[...light.keys()].sort()` deep-equals `[...dark.keys()].sort()`; a token in
  one palette only fails that test.
- Each resolves to a six-digit hex. Same test loops every token that isn't
  `--f-*`, `--s[1-9]`, or `--measure`.
- **4.5:1 against `--sunk`** in both palettes. `.src` is
  `background: var(--sunk)` at `styles.ts:523` and diff text is 12.5px, so it
  is small text on the sunk ground and owes AA. `--ground` is not the binding
  constraint here.
- Separable in greyscale, so they differ in **lightness as well as hue**. The
  `+` and `−` characters stay as the non-colour signal, and 1.4.1 is satisfied
  by them, but a reader with either form of red-green deficiency should still
  see two tones rather than one.
- `--diff-del` must not read as brand pink. `--accent-text` is `#ff6ea8` dark
  and `#c9105c` light; a removal tone that lands near either will look like a
  link at 12.5px. Push it away from that hue or accept it only after Nick has
  seen both themes.
- Carry the measured ratios in the comment, in the form `--accent` already
  uses: `/* 5.9:1 on sunk — removed lines */`.

**The token block is asserted verbatim between `docs/BRAND.md`'s first ` ```css `
fence (line 21) and `tokens` in `src/html/styles.ts`.** Both files change, byte
for byte, in the same commit. Editing one is a failing test, which is the
point.

Draw the tone on the text and add a 2px `border-left` in the same colour, so
the mark survives a rendering that flattens colour:

```css
.diff .a { color: var(--diff-add); border-left: 2px solid var(--diff-add); padding-left: var(--s2); }
.diff .d { color: var(--diff-del); border-left: 2px solid var(--diff-del); padding-left: var(--s2); }
```

**Do not reach for `display: block` on those spans to get a full-width row
tint.** `diffBody` at `commit-page.ts:118` joins the rendered lines with `\n`;
a block-level span supplies its own line break and the newline then supplies a
second, double-spacing every changed line. If a full-bleed row is wanted later,
the join changes with it — one thing, deliberately, not as a side effect.

Extend `@media (forced-colors: active)` if the border needs to survive there;
`styles.ts:597` is where that block starts.

## 7 · The commit page never says why some diffs are inline

`commit-page.ts:70-83` builds every file row identically whether its `href` is
`#f-3` on this page or `changeHref(...)` to a page of its own. Two destinations,
one presentation. That — not the fitting strategy — is what makes the split
look arbitrary.

**Keep the strategy.** Fitting as many diffs as the budget allows is right; the
alternative discards eight readable diffs to avoid explaining the ninth.

Mark the rows, using the `.t-micro` treatment the `Default` branch marker
already establishes:

- inline → `<span class="t-micro">Below<span class="vh"> on this page</span></span>`
- linked → `<span class="t-micro">Own page</span>`

And say it in prose. `fileList()` currently emits `Showing the first N of M
files.` only when the **file list** is cut; it says nothing when the list is
whole and only some **diffs** inlined, which is the common case and the one
Nick hit. Add a second sentence for `shape.diffs < candidates.length`:

> Diffs for the first N files are below. The rest have a page each.

Both sentences use `.t-label` and sit where the existing one does.

Binary files are a third case — they have no diff at all and their row links to
a change page that says so (`noDiff()` at `commit-page.ts:346`). They should not
carry `Own page` as though a diff were waiting. Give them nothing, or `Binary`,
and keep `counts()` unchanged since it already renders `Binary` in the count
cell.

---

# Part C · Reachability

## 8 · Branches and tags cannot be reached by clicking

Grepped across `src/html/` and `src/routes/`, the complete set of inbound links:

- `/r/:repo/commits` — the commit page's own breadcrumb, and ref-list rows
- `/r/:repo/branches` — **nothing**
- `/r/:repo/tags` — **nothing**

Two routes shipped with no way in. The repo page is
`identity → h1.vh → Files → README` and carries no navigation at all.

**This is a new component, so `docs/BRAND.md` gets it first.** There is no nav
or tabs component in BRAND today. Write the section, regenerate, then build.
The section needs to settle, at minimum:

- Whether it is a `<nav>` with `aria-label`, and what the label is
- That it is links, never a tab widget — no `role="tablist"`, no
  `aria-selected`, since each destination is a page load
- Whether the current page's own entry appears and how it is marked. The Chip
  component's `.chip--current` rule (`docs/BRAND.md:670`) is the precedent:
  weight and border, not colour alone
- `target-size` — the gate runs WCAG 2.2 AA, so every entry needs the hit area
  the Row component already documents

**Put it on the repo page only, in this revision.** `/r/:repo` is the hub every
breadcrumb passes through, so one hop reaches it from anywhere. Nav on every
repo view is a larger idea about product chrome and belongs to whichever phase
takes that up.

Entries: **Commits**, **Branches**, **Tags**. `commitsHref` and `refsHref` are
already exported and are the only correct sources for those URLs — no string
literals.

## 9 · Every unmatched URL returns JSON

`buildApp()` in `src/app.ts` has no `setNotFoundHandler`. Fastify's default
handler answers `/r/gantry/tree/main`, `/nonsense`, and every typo in the
product with `{"message":"Route GET:… not found","error":"Not Found"}` — in a
project where the error page is a documented design surface with ten failure
states.

This predates 1e. It closes here because 1e is what made a person type a URL
that misses, and because leaving it open makes item 7's sibling case look like
a bug in the tree route.

Register a handler in `buildApp()` that renders the error page. It needs a
failure that is honest about knowing nothing — the route did not match, so
there is no repo, ref or path to name. Add one to `src/html/error-page.ts`
beside the existing ten, with `path: "/404"` like its neighbours, and 404 as
the status.

Two things to get right:

- **The `onSend` hook must still run.** CSP, `X-Content-Type-Options` and
  `Referrer-Policy` are set there for every reply; a 404 is not exempt.
- **It must not swallow the git HTTP transport's own 404s.** `git-http.ts`
  answers unknown repos on `/r/:repo/info/refs`; those are matched routes
  replying 404 and are untouched by a not-found handler, but check that a git
  client fetching a nonexistent repo still gets what it got before. A
  `Content-Type: text/html` body where a client expects a pkt-line stream is a
  regression a browser will never show you.

## 10 · `Newer ←` on the commit log

`loadCommitLog` pages by SHA cursor, forward only: `next` is the boundary
commit and there is no back edge. `src/repos/log.ts:3-6` explains why `--skip`
was rejected and that reasoning stands — do not reintroduce it.

**Carry the cursor stack in the URL.** The page-start cursors are already known
to whoever navigated there; they cost nothing to keep and no extra git call to
use:

- `?ref=main` — page one, no `from`, no `back`
- `?ref=main&from=A` — page two, `back=` empty
- `?ref=main&from=B&back=A` — page three
- `Newer ←` pops the last entry: from page three it links `?ref=main&from=A`,
  from page two it links `?ref=main`

Rules:

- Every entry validates against `oidPattern`, the same guard `from` gets at
  `log.ts:66`. One bad entry rejects the whole parameter — fall back to page
  one rather than half-trusting it.
- Cap the stack at 32 entries. Past that, drop the oldest and let `Newer` walk
  as far as the stack reaches; the alternative is an unbounded URL.
- `Newer ←` renders only when the stack is non-empty. `Older →` keeps its
  existing condition.
- `commitsHref` gains the parameter. It is imported by `ref-list.ts` and
  `commit-page.ts`; neither passes a stack, and both must keep producing the
  URLs they produce today.
- The route's query schema and `showCommits` in `repo-page.ts` accept and
  thread it.

Mirror `Older →`'s markup exactly — same `.showall` paragraph, same
`aria-hidden` arrow, arrow on the leading side for `Newer`.

---

# Part D · One more correction

## 11 · A lightweight tag and an annotated tag are indistinguishable

Correctly, given the query. `src/repos/refs.ts:2-5` selects `contents:subject`
and `creatordate` **because** both fields populate for a commit and for a tag
object — that uniformity is exactly why the row cannot tell them apart. The
comment is right and the choice was right; it just left nothing for the view to
show.

Add `%(objecttype)` to the `for-each-ref` format at `refs.ts:75`. No second spawn, one
more field. A lightweight tag's ref names a commit and yields `commit`; an
annotated tag's names a tag object and yields `tag`.

- `Ref` gains `annotated: boolean`.
- `parse()` at `refs.ts:38` splits on `\0` into four parts now, not three. Its
  `undefined` guard covers every destructured name — extend it, don't leave the
  new one unchecked.
- Tag rows get a marker built the way `marker()` at `ref-list.ts:38` builds
  `Default`: `<span class="t-micro"> Annotated</span>`, on tag lists only.
- The existing guard at `refs.ts:47-50` — a tag naming a blob or tree has an empty
  `creatordate` and is skipped — stays exactly as it is.

---

# Out of scope

- **"Behind" counts on branches.** Needs `rev-list --count` per ref, turning a
  one-spawn page into an N-spawn one against a documented budget of twelve.
  Real, wanted, and its own decision.
- **A redirect from `/r/:repo/tree/:rev/` to `/r/:repo`.** `noTreeRoot` is
  deliberate. Whether an error is the right answer there is worth revisiting
  once item 9 has made the neighbouring URL an error page too, and not before.
- **The raw origin, `og:image`, and line numbers.** See the top of this
  document.
- **Nav on every repo view.** See item 8.

---

# The verify script

`scripts/verify-phase-1e.sh` has 31 checks. Add to it rather than starting a
new script — `.claude/CLAUDE.md`'s Phase size section says sub-phases share one
growing script. Number from 32.

Assert at least:

- Every visible page title renders `.t-item`, and no page renders `.t-l` or a
  `.t-label` `<h1>`
- `src/html/ref-list.ts` emits no `<table>`, `<thead>` or `<th>`
- `--diff-add` and `--diff-del` appear in both palettes, and `.diff .a` and
  `.diff .d` resolve to different values
- `docs/BRAND.md`'s token fence and `styles.ts`'s `tokens` are byte-identical
  — `tokens.contract.ts` already asserts it; the check is here so a failure
  names itself in the gate output
- An unmatched URL returns `text/html` and the error page's heading, not JSON
- `/r/:repo` links to all three of commits, branches and tags
- Page two of a log carries a `Newer` link and page one does not
- An annotated tag row carries the marker and a lightweight one does not
- `.meta` declares `grid-template-columns: 1fr` outside any media query

**Follow the check-18 lesson.** `verify-phase-1d.sh` check 16 failed on an
anchored `sed` that assumed one breakpoint; 1e's check 18 passed the equivalent
case with a tolerant `grep -c`. A check parsing another file's shape matches the
loosest pattern that still discriminates.

# Stories and baselines

`tuffgal/stories/` has eight stories covering the six routes and the dead ends.
**They should need no structural change** — every item here alters
presentation, not navigation. If a story breaks, that is a finding about the
change, not about the story: report it before editing the story to match.

Re-shoot every baseline **once, at the end, in one commit**, with the reason
beside it. A revision that re-shoots three times has thrown away the only
signal a baseline carries. The container is pinned to `linux/arm64` for the
reason `docs/PLAN.md` §10 records; nothing here changes that.

# Handoff

Report, before Nick reviews anything:

- The `docs/LAYOUT.md` §02 paragraph and the `docs/BRAND.md` nav section, as
  written, and confirmation that `scripts/docs-artifact.mjs` ran
- The two diff token values, both palettes, with measured ratios against
  `--sunk` — and say plainly if either misses 4.5:1 rather than shipping it
- `npx tsc --noEmit`, `biome check .`, `npm run test`, and
  `sh scripts/verify-phase-1e.sh`, all clean, before the baselines re-shoot
- Whether any story needed editing, and why
- Anything in this document you could not build, and what stopped you
- Anything you changed that is **not** in this document, and why

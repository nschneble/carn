# Contract tests a 1e story now covers

**Nothing here is deleted. This is a proposal awaiting an approved
baseline.**

`.claude/CLAUDE.md`'s Testing section says the deletion follows an approved
baseline, never a written story: a story proves nothing until Nick has
looked at its baseline and accepted it. The baselines this list depends on
were re-shot in the same commits that touched the views below. Until they
are reviewed, every test below keeps running exactly as it does today.

## What counts as covered, and what does not

A Tuffgal baseline freezes two artefacts per action and breakpoint: the
rendered PNG and the Playwright a11y snapshot. The snapshot is the stronger
of the two here — it carries roles, accessible names, and `/url:` targets,
so a link's destination is genuinely captured, not merely implied by
pixels. That snapshot also carries the plain text of every paragraph, term,
definition, and code region on the page — a `<p>`'s wording, a `<dl>`'s
key/value pairs, a diff's `+`/`−` lines, are all read back as literal text,
not just roles. A rendered sentence is covered the moment a story's
baseline shows it, word for word.

Five things a baseline still cannot do, and every assertion resting on one
of them stays where it is:

- **Read a status code or spot a redirect.** `error-no-directory` shows the
  404 page; it cannot show that the response was 404 rather than a 200 or a
  302. Every `assert.strictEqual(response.statusCode, 404)` stays.
- **Weigh a page, or count a spawn.** Gzip-5 wire bytes and `git`
  invocations are invisible on screen. Every budget and spawn-count
  assertion stays.
- **Verify a computed invariant an eye does not check.** A baseline proves
  the page still looks like the approved image. It does not prove "no sha
  repeats across the two log pages" — a reviewer approving the first
  capture would not have checked. Those stay too.
- **Carry a DOM attribute the accessibility tree drops.** The snapshot is
  roles, accessible names, `/url:` and plain text, and that is all.
  `tabindex`, `lang`, `id`, `datetime`, `aria-describedby`, class names and
  the document `<title>` never appear in it, in any capture. This is the
  single mechanism behind most of the partials below, so a row asserting
  one of these is partial no matter how completely the visible half is
  covered.
- **Assert an axe rule.** `axe.contract.ts` runs `wcag2a` through
  `best-practice` across both render paths. A Playwright snapshot is not an
  audit and does not run a rule, so anything whose point is a named axe
  outcome — focus-order-semantics, aria-required-children, target-size —
  stays.

Assertions covered only in the fixture's one configuration are also left
off. `refs.contract.ts:350`'s empty-list state and
`blob-page.contract.ts:231`'s raw-origin-configured branch have no story
reaching them, so they are not listed even as maybes: the visual harness
never seeds an empty ref list and never sets `CARN_RAW_ORIGIN`.

## The list

Forty-three assertions across seven files, grouped by the test that holds
them.

### `test/contract/tree-page.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 350 | `rows link by kind, and a gitlink links nowhere` — **partial** | `read-the-assets` → `gantry-tree-gitlink` captures `listitem: lib Submodule pinned at 0000000` with no link at all, and `walk-the-tree` → `gantry-show`/`gantry-tree-nested` capture file rows at `/url: /r/gantry/blob/main/…` beside directory rows at `/url: /r/gantry/tree/main/…`. **The row anchor's `lang="en"` and the `row is-sub` / `nm t-item` class assertions stay**: neither an attribute nor a class name reaches the snapshot |
| 383 | `a directory row links to the tree route, one level down` — **partial** | `walk-the-tree` → `gantry-tree-nested`, which reaches `apps/web/src` by clicking three directory rows in turn; a row linking to the wrong route fails the story rather than the diff. **The same `lang="en"` and class half of the one assertion stays** |
| 334 | `the cap and the lift work at a nested depth too` | `gantry-tree-nested` (16 of 19 rows, plus `link "Show all 19"` at `/url: …/apps/web/src?all=1`) and `gantry-tree-nested-all` (all 19). The `doesNotMatch(/<details\|<summary\|aria-expanded/)` clause is covered too: a `<details>` would appear in the snapshot as a group node |
| 432 | `a tree page carries no readme and one h1` — **partial** | `gantry-tree-nested` — the snapshot's `main` holds exactly one `heading … [level=1]` and no readme prose. **The `<title>apps/web/src · gantry · Càrn</title>` assertion stays**: no capture records a page title, in the a11y snapshot or in `manifest.json` |

### `test/contract/refs.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 171 | `an annotated tag carries its own subject and a real date` — **partial** | `read-the-refs` → `gantry-tags`. The two kinds sit in one list drawing from different sources: `v1.1.0` shows its own tag-object subject (`Version 2, with the deep path in place`) and its tagger age (`1w`), `v1.0.0` shows the pointed-at commit's subject `Bring the assets in` and that commit's age (`3w`). **The exact `at.toISOString()` values and the three-tag newest-first order stay**: the page renders ages, not dates, and `gantry` carries two tags where the test needs a third to pin the sort |
| 245 | `every row is three links to the log scoped to that ref` | `gantry-branches` and `gantry-tags` — each listitem carries three links (`main Default`, `Subject …`, `Updated …`), each to that ref's own `?ref=` log |
| 275 | `three links per row, and no row overlay swallows the other two` | The same two snapshots: exactly three links per row, none of them wrapping the whole `<li>`. A row-wide overlay anchor would collapse the three into one link |
| 307 | `the branch table names the default branch, and the tag table does not` | `gantry-branches` shows `link "main Default"` beside a bare `link "topic"`; `gantry-tags` carries no `Default` anywhere |
| 323 | `an annotated tag carries the marker, a lightweight one does not` | `gantry-tags` — `v1.1.0` shows as `link "v1.1.0 Annotated"`, `v1.0.0` as bare `link "v1.0.0"` |
| 566 | `the two routes are the two nouns, and the page says which it is` — **partial** | `gantry-tags` — `heading "Tags" [level=1]`, exactly one heading. **The `refsHref()` data assertions, the `<title>`, and the og:url `content=` string stay**: none render, and the h1's literal `class="t-item"` is a class name |

### `test/contract/commit-log.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 204 | `the rendered pages repeat no sha either` — **in kind, not in regime** | `read-the-log` → `gantry-log` and `gantry-log-older` render two disjoint pages: page one's sixteen shas (`6e8b63b` … `e6f20cb`) share nothing with page two's eight (`964cd2c` … `884f2b9`). **The test's own 40-commit fixture and its `unique.size === depth` count stay**: the story proves no *visible* overlap on *these* two pages, not the general no-repeat property over an arbitrary depth |
| 233 | `the last page says so, and the pages before it do not` — **partial** | `read-the-log` — `gantry-log` carries `link "Older"`, `gantry-log-older` carries none (only `Newer`), and the second was reached by clicking the first. **The `pages.length` and `last.next === null` half stays**: it walks the log through `loadCommitLog` and asserts on the data, never on a rendered page |
| 366 | `a row carries three links to the commit and no row overlay` — **partial** | `gantry-log` — every row is three links (short sha, subject, `Committed <age>`) at one href, with no table markup and exactly one `<h1>`. **The `datetime="…"` half stays**: the snapshot records the human-readable `time: 3w`, never the machine-readable attribute beside it |
| 393 | `the sixteen-row cap is the page size the walk uses` — **partial** | `gantry-log` renders exactly sixteen rows before `Older` appears, which is the cap made visible. **The bare `logRowCap === 16` constant assertion stays**: it reads a number out of source, not a page |
| 476 | `Newer renders from page two on, and pops one cursor at a time` — **partial** | `read-the-log` — `gantry-log` (page one) carries no `Newer`; `gantry-log-older` (page two) carries `link "Newer"` back to the bare ref. **The three-page pop-twice clause stays**: the story never reaches a third page, so the cursor stack is never popped more than once |
| 560 | `a refused ref says what happened, then what to do` — **partial** | `hit-a-dead-end` → `error-no-ref` renders the exact `failure.said` text, `There's no branch, tag, or commit named nope in this repo.`, and no `Oops`/`sorry`/`!`/`…` anywhere on the page. **The `failure.path === "/404"` assertion stays**: a category string, not a rendered fact |

### `test/contract/commit.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 318 | `the diffs stop at the first file that would overrun, and the rest are links` — **in kind, not in regime** | `read-a-commit` → `gantry-commit-shed`. Two rows (`src/api.ts`, `src/app.ts`) inline at `#f-0`/`#f-1`; the four that would overrun (`src/big.ts`, `src/index.ts`, `src/notes.md`, `src/wide.ts`) link out to their own pages. `gantry-change` then follows one of those links. **But the test's own fixture is a 40-file noisy commit**, which is what reaches the general cutoff rule at scale. The story's commit has six and cuts after two, so the rule is covered and the regime it was written for is not |
| 365 | `row markers say where a diff lives, and binary carries neither` — **partial, in kind** | `gantry-commit-shed` — inlined rows carry `link "src/api.ts Below on this page"`, own-page rows carry `link "src/big.ts Own page"`. **The binary-carries-neither half stays**: no story's commit page lists a binary file among its changed rows |
| 403 | `a second sentence says how many diffs are below when the file list is not also cut` | `gantry-commit-shed` renders the literal sentence, `Diffs for the first 2 files are below. The rest have a page each.`, and `gantry-commit-inlined` — a commit whose diffs all fit — renders no such sentence at all. Both halves of the contrast are on screen |
| 504 | `a single file too big for the page is cut on a line boundary` — **partial** | `gantry-change` renders `paragraph: Showing the first 113 lines of this diff.` and `git show 6e8b63b74ed9c59bc730751e9fa6ec8f71c3edba -- src/big.ts`. **The line-boundary-precision clause stays**: whether the cut lands exactly on a line is a count, not something a reader can see |
| 524 | `a path the commit does not change is a 404, not a crash` — **partial** | `hit-a-dead-end` → `error-no-change` renders `That commit doesn't change src/nope.ts.` and `Check the path, or read the whole commit.`, with no apology. **The `commitFilePage(...) === null` and `.path === "/404"` assertions stay**: neither is a rendered fact |
| 552 | `the meta block is BRAND.md's four keys, with no heading in it` — **partial** | `gantry-commit-inlined` and `gantry-commit-shed` both render `Author` / `Parents` / `Changed` / `Signed` as terms, with no heading role between them. **The `<div><dt>` wrapping-structure assertion stays**: a bare `<div>` carries no role |
| 572 | `every signature status renders a sentence rather than a letter` — **in kind, not in regime** | Every captured gantry commit shows `No signature` (`gantry-commit-inlined`, `gantry-commit-shed`). **The other eight signature-status sentences stay**: no commit in the fixture is signed, so `G`/`B`/`R`/`U`/`X`/`Y`/`E` never render |
| 598 | `the heading, the title, and the canonical all name the commit` — **partial** | `gantry-commit-inlined` renders `heading "Bump the version and say so" [level=1]` and `paragraph: 51173f5` (the short sha). **The `<title>`, the og:url `content=`, and the body-text clause stay**: none of `gantry`'s commits carry a body beyond their subject, so no story ever renders one |

### `test/contract/blob-page.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 61 | `a file under the cap renders whole, with no notice and no hatch` — **partial** | `read-the-source` → `gantry-blob-small`: whole source, no truncation notice. **The no-escape-hatch clause stays.** The test passes `rawOrigin`, and "no `Show entire file`" only means anything when one is configured; the visual harness never sets `CARN_RAW_ORIGIN`, so every baseline satisfies that clause for the wrong reason. It is the same configuration gap that keeps `:231` off this list entirely |
| 76 | `a file over the cap is cut on a line boundary and says so` | `gantry-blob-truncated` — `paragraph: Showing the first 104 lines of 240.` above a block whose last line is whole |
| 243 | `the escape hatches are absent unset and point at the origin set` — **partial** | `gantry-blob-truncated`, `gantry-blob-binary`, and `gantry-blob-oversize` all render with no origin configured, and none of the three carries `Show entire file` or `Open raw`. **The origin-set half stays**: no story ever configures one, so the hatch never appears to be checked |
| 464 | `the source block carries the region semantics the audit needs` — **partial** | Every blob and diff capture: the snapshot carries `region "src/big.ts"`, which is the `role="region"` plus `aria-labelledby` pair resolving to the heading. **The rest of the test stays**: `tabindex="0"`, the `lang="en"` on the h1, and the `<h1 class="vh">`-versus-visible distinction are all attributes and classes the snapshot drops, and the `<div tabindex="0">` clause exists to hold a named axe outcome, focus-order-semantics |
| 407 | `an oversize raster and a binary decline in the file's own words` — **partial** | `read-the-assets` → `gantry-blob-binary` covers the binary half (`Binary file, 512 B. Not shown here.`), and `gantry-blob-oversize` covers the oversize-raster half (`PNG image, 75.2 KB. Too large to show here.`). **The MP4-video wording stays**: no story's fixture carries a video file |

### `test/contract/breadcrumb.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 151 | `the separator is real dom text, and every one is aria-hidden` — **partial** | Every multi-segment breadcrumb capture (`gantry-tree-nested`, `gantry-blob-deep`, `gantry-commit-inlined`, and others) shows each ancestor as a clean `link "name"` with no `»` leaking into any accessible name. **The "real DOM text, not CSS `content:`" distinction and the stylesheet-source check stay**: both a real hidden node and generated content are equally invisible to the tree |
| 177 | `ancestors are links, and the current segment is not` — **in kind** | Every breadcrumb capture: every ancestor listitem is a `link`, and the last listitem is bare text with no link role. `gantry-tree-nested`'s trail (`Càrn` → `gantry` → `apps` → `web`, then bare `src`) is one example among many |
| 192 | `the index page keeps its own masthead, unchanged` — **partial** | `repo-index` — the banner holds `link "Skip to content"` then `link "Càrn"`, and no `navigation` landmark at all. **The exact masthead markup string stays**: matching HTML byte for byte is not something a snapshot does |
| 204 | `the breadcrumb does not replace the repo page's .vh heading` — **partial** | `repo-show` — `heading "linklater" [level=1]` and `navigation "Breadcrumb"` both appear, and the breadcrumb's own list carries no heading role. **The literal `class="vh"` stays**: a class name never reaches the tree |
| 218 | `a trail with nothing to hide renders no fold and no hidden segments` — **in kind, not in regime** | Every real breadcrumb tops out at six segments (`gantry-blob-deep`: `Càrn` … `deep.ts`) and none shows a fold or a hidden middle. **The nine-segment folded case stays entirely unreached**: no story's fixture nests eight levels deep, which is what the fold threshold needs |
| 399 | `every ancestor link on a blob three levels deep answers 200` — **in kind, not in regime** | `walk-the-tree` clicks through `apps/` → `web/` → `src/` to reach `deep.ts`, and each click's own `expect` succeeding is proof each ancestor link resolves to a working page; `gantry-tree-nested`'s own capture shows the deepest ancestor listing its own directory, not the root's. **The literal HTTP 200 and the exact four-item href array stay**: a click succeeding is not the same fact as a status code, and the real fixture's paths are not `a/b/c.ts` |
| 470 | `the trail from a nested tree page climbs to the repo page` — **in kind** | `walk-the-tree` starts at `gantry-show` (the repo page, `heading "gantry" [level=1]`) and every deeper capture's breadcrumb carries `gantry` as a working link back to it. **The exact two-ancestor array and the `<h1 class="vh">` string stay**: the real fixture nests three levels, not two, and a class name is not visible |

### `test/contract/index-page.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 27 | `the shell is one header, one main, and one footer` — **partial** | `repo-index` — the snapshot carries exactly one `banner`, one `main`, one `contentinfo`, and no `navigation` landmark. **The doctype, viewport meta, `<title>`, stylesheet `<link>`, and `<main id tabindex>` assertions stay**: none of them render into anything a snapshot or a screenshot shows |
| 64 | `the skip link is the first focusable thing on the page` — **in kind, partial** | `repo-index` — `link "Skip to content"` is the first item in the tree, ahead of the `Càrn` home link. **The literal focusable-tag-type scan and the "inside `<header>`" check stay**: a snapshot lists accessible elements in order, not every tag that could receive focus |
| 82 | `one h1, the list's own label, and no other heading` — **partial** | `repo-index` — `heading "Repositories" [level=1]` appears exactly once. **The `class="t-item"` and `t-xl`-absence assertions stay**: class names never reach the tree |
| 90 | `the index lists every repo, with no cap and no show-all` — **in kind, not in regime** | `repo-index` shows exactly five rows for five repos, with no `Show all` anywhere. **The 40- and 200-repo cases stay unreached**: the real fixture never grows past five, so the claim the test exists to prove — that the list still does not cap at scale — is not demonstrated |
| 109 | `a row is an anchored name, a description slot, and a datetime` — **partial** | `repo-index` — `link "linklater"` at `/url: /r/linklater`, and `sparrow` (the fixture's one repo with no description) shows `text: Created` with nothing before it, matching the empty `.msg` span in kind. **The exact `.msg`-span count and the `datetime="…"` attribute stay**: one is a class-selector count, the other is named in the governing rule above |

## Reviewed, and excluded wholesale

Three of the nine changed files contribute no rows, for reasons the
governing rule above already states:

- **`axe.contract.ts`** asserts axe rule outcomes (target-size verdicts,
  aria-required-children, the ruleset's own configuration) or computed
  geometry (`getBoundingClientRect()` heights) against a bespoke fixture
  server, never the real app routes a story visits. Every assertion in it
  falls under the fifth bullet above, the geometry checks under the third.
- **`page-csp.contract.ts`** loads synthetic documents (`/marked`,
  `/unfixed`, and ad-hoc index pages) into a standalone fixture server and
  reads `getComputedStyle()` values and CSP console messages. No path it
  serves is a route Tuffgal captures, and none of what it asserts — font
  metrics, CSS custom-property values, refused-resource console text —
  reaches the accessibility tree either way.
- **`tokens.contract.ts`** computes contrast ratios and luminance
  separation from the raw CSS source text. It never renders a page; a
  baseline shows that a color was used, not what its ratio against another
  color measures out to.

The rest of `test/contract/` — `access`, `assets`, `escaping`,
`fonts`/`fonts-budget`, `gallery`, `git-http`, `git-spawn`, `header`/
`header-route`, `headers`, `index-failure`, `markdown`, `render-paths`,
`ssh-auth`/`ssh-exec`/`ssh-transport`, `syntax-palette`,
`token-resolution`, `unquoted-attribute`, and `wordmark` — was scanned test
by test. None renders a full page a story navigates to; they assert on git
subprocess calls, SSH handshakes, source-level regexes, and internal data
structures. `repo-page.contract.ts` covers `/r/:repo`, the page
`repo-index` and `repo-show` do visit, but it predates 1e and is out of
this document's scope, which is what a 1e story covers — not what an
earlier phase's story already does.

## Five the list deliberately excludes

`tree-page.contract.ts:177` (`a nested path lists its own entries, not the
root's`) calls `listTree()` and asserts on the entries it returns, so no
rendered capture can reach it at all. The listing it asserts on is one
directory holding a directory, two files and a gitlink together; `gantry`'s
gitlink sits alone under `vendor/`, and no other directory in the fixture
mixes all three kinds.

`tree-page.contract.ts:407` (`a ref and a name that need encoding get it`)
turns on a ref carrying a slash and a filename carrying a hash. `gantry`'s
refs are `main` and `topic`, and its filenames (`deep.ts`, `mod-00.ts`, …)
carry nothing that needs escaping.

`commit.contract.ts:300` (`a one-file commit renders whole, and still shows
the file list`) turns on the commit having exactly one file: it asserts one
diff block and `rowHrefs(markup) === ["#f-0"]`. Both captured commit pages
are wider than that — `gantry-commit-inlined` is a two-file commit with
rows `#f-0` and `#f-1`, and `gantry-commit-shed` has six. The fixture has
no one-file commit reachable from a story, so none of this test's own
assertions are exercised.

`commit-log.contract.ts:461` (`the older link is a real url with an escaped
separator`) turns on a ref needing percent-encoding. `gantry`'s default
branch is `main`, so the snapshot shows the `&`-separated form and never
the `release%2F1.2` case the test exists for.

`breadcrumb.contract.ts:323` (`the collapse drops the middle from the
layout and the a11y tree`) turns on a trail eight segments deep, at exactly
the two breakpoints Tuffgal captures. No real story nests past six
(`gantry-blob-deep` tops out at `Càrn` › `gantry` › `apps` › `web` › `src`
› `deep.ts`), so the fold this test exists to prove never fires on a real
page.

## One row the old document cited that no longer exists

`refs.contract.ts`'s old `no row carries an overlay anchor` was rewritten
during the revision into `three links per row, and no row overlay swallows
the other two` (now line 275) — a real successor, not a deletion, but not
the same test the old document pointed at either. It is listed above under
its current name and line; the old citation is gone, not covered and not
uncovered.

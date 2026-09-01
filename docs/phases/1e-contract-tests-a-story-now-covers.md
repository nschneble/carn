# Contract tests a 1e story now covers

**Nothing here is deleted. This is a proposal awaiting an approved baseline.**

`.claude/CLAUDE.md`'s Testing section says the deletion follows an approved
baseline, never a written story: a story proves nothing until Nick has looked
at its baseline and accepted it. The baselines this list depends on were shot
for the first time in the same commit that added this file. Until they are
reviewed, every test below keeps running exactly as it does today.

## What counts as covered, and what does not

A Tuffgal baseline freezes two artefacts per action and breakpoint: the
rendered PNG and the Playwright a11y snapshot. The snapshot is the stronger
of the two here — it carries roles, accessible names, and `/url:` targets, so
a link's destination is genuinely captured, not merely implied by pixels.

Three things a baseline still cannot do, and every assertion resting on one
of them stays where it is:

- **Read a status code or spot a redirect.** `error-no-directory` shows the
  404 page; it cannot show that the response was 404 rather than a 200 or a
  302. Every `assert.strictEqual(response.statusCode, 404)` stays.
- **Weigh a page, or count a spawn.** Gzip-5 wire bytes and `git` invocations
  are invisible on screen. Every budget and spawn-count assertion stays.
- **Verify a computed invariant an eye does not check.** A baseline proves the
  page still looks like the approved image. It does not prove "no sha repeats
  across the two log pages" — a reviewer approving the first capture would not
  have checked. Those stay too.

Assertions covered only in the fixture's one configuration are also left off.
`refs.contract.ts:305`'s empty-list state and `blob-page.contract.ts:231`'s
raw-origin-configured branch have no story reaching them, so they are not
listed even as maybes.

## The list

Seventeen assertions across five files, grouped by the test that holds them.

### `test/contract/tree-page.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 350 | `rows link by kind, and a gitlink links nowhere` | `read-the-assets` → `gantry-tree-gitlink` captures `listitem: lib Submodule pinned at 0000000` with no link at all, and `walk-the-tree` → `gantry-show` captures file rows at `/url: /r/gantry/blob/main/…` beside directory rows at `/url: /r/gantry/tree/main/…` |
| 383 | `a directory row links to the tree route, one level down` | `walk-the-tree` → `gantry-tree-nested`, which reaches `apps/web/src` by clicking three directory rows in turn; a row linking to the wrong route fails the story rather than the diff |
| 334 | `the cap and the lift work at a nested depth too` | `gantry-tree-nested` (16 of 19 rows, plus `link "Show all 19"` at `/url: …/apps/web/src?all=1`) and `gantry-tree-nested-all` (all 19). The `doesNotMatch(/<details\|<summary\|aria-expanded/)` clause is covered too: a `<details>` would appear in the snapshot as a group node |
| 432 | `a tree page carries no readme and one h1` | `gantry-tree-nested` — the snapshot's `main` holds exactly one `heading … [level=1]` and no readme prose |

### `test/contract/refs.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 169 | `an annotated tag carries its own subject and a real date` | `read-the-refs` → `gantry-tags`. The two kinds sit in one table drawing from different sources: `v1.1.0` shows its own tag-object subject and its tagger date (`1w`), `v1.0.0` shows the pointed-at commit's subject `Bring the assets in` and that commit's age (`3w`) |
| 248 | `every row is three links to the log scoped to that ref` | `gantry-branches` and `gantry-tags` — each row's three cells each carry a link, all three to that ref's own `?ref=` log |
| 278 | `no row carries an overlay anchor` | The same two snapshots: exactly three links per row and no anchor wrapping the row. A fourth would show |
| 289 | `the branch table names the default branch, and the tag table does not` | `gantry-branches` shows `link "main Default"` beside a bare `link "topic"`; `gantry-tags` carries no `Default` anywhere |

### `test/contract/commit-log.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 231 | `the last page says so, and the pages before it do not` | `read-the-log` — `gantry-log` carries `link "Older"`, `gantry-log-older` does not, and the second was reached by clicking the first |
| 364 | `a row carries three links to the commit and no row overlay` | `gantry-log` — every row is three links (short sha, subject, `Committed <age>`) at one href, with no wrapping anchor |

### `test/contract/commit.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 318 | `the diffs stop at the first file that would overrun, and the rest are links` | `read-a-commit` → `gantry-commit-shed`. Two rows anchor to `#f-0`/`#f-1` with their diffs inlined below; the four that would overrun link out to `/r/gantry/commits/<sha>/<path>`. `gantry-change` then follows one of those links |
| 489 | `the meta block is BRAND.md's four keys, with no heading in it` | `gantry-commit-inlined` — `Author`, `Parents`, `Changed`, `Signed` as terms with no heading among them |
| 300 | `a one-file commit renders whole, and still shows the file list` — **partial** | `gantry-commit-inlined` covers the file-list, `#f-N` anchor and `+N added −N removed` assertions (lines 304–314). **The `pageWireBytes(markup) <= budgetBytes` assertion on line 315 is not covered and must stay**, so this one is a rewrite rather than a deletion |

### `test/contract/blob-page.contract.ts`

| Line | Test | Now covered by |
|---|---|---|
| 61 | `a file under the cap renders whole, with no notice and no hatch` | `read-the-source` → `gantry-blob-small`: whole source, no truncation notice, no escape hatch |
| 76 | `a file over the cap is cut on a line boundary and says so` | `gantry-blob-truncated` — `paragraph: Showing the first 104 lines of 240.` above a block whose last line is whole |
| 464 | `the source block carries the region semantics the audit needs` | Every blob and diff capture: the snapshot carries `region "src/big.ts"`, which is the `role="region"` plus `aria-labelledby` pair resolving to the heading |
| 407 | `an oversize raster and a binary decline in the file's own words` — **partial** | `read-the-assets` → `gantry-blob-binary` covers the binary half (`Binary file, 512 B. Not shown here.`). **The oversize-raster half has no story and must stay** |

## Two the list deliberately excludes

`tree-page.contract.ts:177` (`a nested path lists its own entries, not the
root's`) asserts that directories sort ahead of files. `gantry`'s nested
directory holds no directories and its root sorts `README.md` ahead of
`apps/`, so no capture exercises the clause. Covered in part is not covered.

`commit-log.contract.ts:459` (`the older link is a real url with an escaped
separator`) turns on a ref needing percent-encoding. `gantry`'s default branch
is `main`, so the snapshot shows the `&`-separated form and never the
`release%2F1.2` case the test exists for.

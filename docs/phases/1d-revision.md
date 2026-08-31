# Phase 1d · PR revision, round two

_Nick's first review pass landed five commits, `9c1460d` through `33a8ff6`. Most
of it is good and stays. This document is the subset that has to change before
merge._

**The tree does not pass its own tests.** `npx tsc --noEmit` is clean and
`biome check .` is clean, but eleven contract assertions fail, and four of them
are guards that exist specifically to catch what has now happened to them. Fix
those first, in the order below; the ordering is by consequence, not by effort.

Read `.claude/CLAUDE.md` in full, then `docs/BRAND.md`, `docs/LAYOUT.md`,
`docs/STACK.md`. `docs/LAYOUT.md` gained a **§00 · The head** section and
`docs/PLAN.md` gained three asset routes and one deferral in this pass — both
already regenerated through `scripts/docs-artifact.mjs`.

**Do not treat any item here as a formatting preference to be re-applied
elsewhere.** Every one is a behaviour or contract change that arrived inside a
formatting pass, which is exactly why they need naming.

---

## 1 · `og:description` is malformed on every page

`src/html/page.ts:23`:

```html
<meta property="og:description" content=${description}"" />
```

The value is unquoted and followed by a stray `""`. `html` escapes the
interpolation but cannot quote it, so a description containing a space ends the
attribute early. Rendered, the 503 page emits:

```html
<meta property="og:description" content=The page failed to load on the server."" />
```

A parser reads `content="The"` and then six bare attributes. Every page with a
multi-word description is affected, which is all of them.

Fix: `content="${description}"`.

`test/contract/unquoted-attribute.contract.ts` already caught this — check 8
reports `src/html/page.ts:23 beforeAttrValue`. The guard worked; the commit
landed anyway. **Run the suite before the next push.**

## 2 · The BRAND ↔ stylesheet verbatim contract is broken

`test/contract/tokens.contract.ts` checks 1 and 13 both fail.
`src/html/styles.ts` lost three things from its token block that
`docs/BRAND.md` still carries:

```
-  --accent: #ff4d95; /* 6.17:1 on ground, 5.21 on sunk — large type, rules */
-  --accent-text: #ff6ea8; /* 7.36:1 on ground, 6.22 on sunk — links, small text */
-  --accent-fill: var(--accent); /* the pink a small label sits on — see 02 */
+  --accent: #ff4d95;
+  --accent-text: #ff6ea8;
+  --accent-fill: var(--accent);
```

Restore all three comments verbatim. **The figures are correct** — recomputed
from the shipped hexes against `--ground` and `--sunk`, they are exactly
6.17/5.21 and 7.36/6.22. Do not adjust them; adjust the file that lost them.

This is not cosmetic. Check 13 parses those comments and recomputes the ratios
from the hex values, which is the mechanism that stops the contrast figures
drifting from the colours — the drift that already happened once, when 4.11 sat
in three documents against a measured 4.10. With the comments gone the check
finds zero annotations and stops discriminating entirely.

Two more differences in the same block:

- **`ui-monospace` was dropped from `--f-mono`.** Restore it. This is a
  functional regression, not punctuation: `ui-monospace` is the keyword that
  resolves to the platform's UI monospace face, and on Apple platforms
  `"SF Mono"` by family name frequently does not resolve for web content. The
  fallback chain is measurably weaker without it.
- `/* spacing — 4px base */` became `/* spacing (4px base) */`. Either spelling
  is fine; the two files have to agree. `docs/BRAND.md` has the em dash.

Everything else in the styles diff is genuinely cosmetic and stays: the `css`
template tag, the collapsed `font-variation-settings`, the blank lines. For the
record, the sheet got **smaller** — 12,245 to 11,681 raw characters across the
four blocks — because collapsing the axis declarations saved more than the
blank lines cost. No budget impact.

## 3 · The font casing · SETTLED, and this item overstepped

**Resolved: CamelCase stays.** `SemiBold`, `ExtraBold`, `SemiExpanded`. The
tree is consistent as of `70d9d5b` — binary, recipe, and test all agree — and
`fonts/README.md` now records the rule and why, so the next copy pass has
something to read instead of a bare string.

**This item originally said "revert both files", over a change Nick had made
deliberately. That was wrong**, and it is left here corrected rather than
deleted, because the reasoning is the useful part.

The defect was real: `fonts/README.md` documents the `setName` calls that
produced `fonts/carn-sans.woff2`, five of them were re-cased to `Semibold`, and
`test/contract/fonts.contract.ts` was edited to match — so both described a font
that does not exist, while the binary still said `Carn Sans SemiBold`. Three
things had to end up agreeing. Which one moved was a decision, and the item
presented the cheap direction as the only correct one.

Two things it also got wrong on the facts:

- **It is thirteen strings, not five.** The recipe rewrites IDs 1, 3, 4, 6 and
  17 by hand. `SemiBold` and `ExtraBold` also live at IDs 263 and 265, their
  PostScript twins at 272 and 274, and `SemiExpanded` at 280 — all upstream,
  and the `>= 256` loop replaces only `Archivo` with `CarnSans`. Re-casing the
  hand-written five leaves the font disagreeing with itself, and ID 272 is a
  `postscriptNameID`, which is what a PDF embeds for the 600 instance.
- **"`SemiBold` is what Archivo upstream uses" was asserted, not checked.** It
  turns out to be true — IDs 263 and 272 are upstream strings the rename never
  touches — but that was luck. It is verified now.

The reason CamelCase wins is not that it is better. It is that `Semibold`
cannot travel alone: it sits beside `ExtraBold` and `SemiExpanded`, so the
sentence-case rule costs `Semiexpanded`, and the alternative is one name
breaking the pattern its two siblings keep inside a single `name` table.

Still true and still in scope: **`test/contract/fonts.contract.ts` must expect
`"and is not the original font."`**, matching name ID 10 in the binary, not the
contracted form the copy pass gave it. That one is a straight mismatch with no
decision attached.

## 4 · The licence arithmetic was deleted, and three checks depend on it

`test/contract/fonts-budget.contract.ts` checks 2, 3 and 4 fail with
`fonts/README.md no longer states the subset comparison`. One sentence was cut
from the RFN paragraph:

> The escape hatch in FAQ 2.2.1 — WOFF2-compress the original, change nothing
> else, keep the name — costs 79,328 B for the pair against 17,696 B subset.
> With the sans face that is 133,940 B, so it blows the 100 KB page budget on
> fonts alone. Renaming is the only route that ships.

Restore it. It is not colour commentary: it is the recorded arithmetic proving
the rename was **necessary** rather than convenient, which is the whole
justification for shipping IBM Plex Mono under another name. Three checks grep
those three figures against the bytes actually on disk, which is what keeps the
claim true as the subset changes.

Copy-editing it is fine. Deleting the numbers is not.

## 5 · Absolute asset URLs break under the app's own CSP

`src/html/page.ts` points the icons at `config.origin`:

```html
<link rel="icon" type="image/png" sizes="96x96" href="${config.origin}/images/favicon.png" />
<link rel="shortcut icon" href="${config.origin}/images/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="${config.origin}/images/apple-touch-icon.png" />
```

`config.origin` defaults to `https://carn.fancyenchiladas.net`, and
`.env.example` now sets it uncommented, so a fresh dev `.env` inherits it. The
app sends `img-src 'self' data:` (`src/app.ts:12`). A favicon is fetched by the
browser rendering the page and is subject to `img-src`, so on any origin that is
not exactly `CARN_ORIGIN` — every local run, every contract test, every Tuffgal
capture — the icons are cross-origin and **CSP refuses them**. In production
they happen to match, so this is invisible where it is tested least.

Make the three icon hrefs site-relative: `/images/favicon.png`, and so on.

**Keep `config.origin` on `og:image`, `twitter:image`, and `og:url`.** Those are
read off-site by crawlers that cannot resolve a relative URL, so absolute is
correct there and only there. `docs/LAYOUT.md` §00 now states the rule.

## 6 · Two comments now say something untrue

**`src/markdown/render.ts:3`** was rewritten to:

```
// remote images are blocked and degrade to alt text to prevent abuse; CSP
// will eventually be replaced with an image proxy
```

It sits directly above `allowLink`, which **permits** remote image URLs. That
was the point of the comment it replaced: the markdown layer parses, the
response header enforces, and the two deliberately disagree. As written it tells
the next reader that this function blocks something it passes through.

The second clause is also wrong in a way that matters. A proxy does not replace
CSP — it serves the bytes first-party so they load *under* `img-src 'self'`,
with CSP still enforcing. `docs/PLAN.md` §04 has this as a privacy control
against leaking every visitor's IP to the image host; "to prevent abuse"
understates it and "replaced" would undo it.

Restore something with both halves. Suggested:

```
// remote https: image urls are permitted here and blocked by CSP
// (img-src 'self' data:, src/app.ts). deliberate: the markdown layer
// parses, the response header enforces. a readme's remote image degrades
// to its alt text — that is the privacy control, see PLAN.md 04. an image
// proxy would serve those bytes first-party, under the same CSP, not
// instead of it
```

**`src/repos/header-asset.ts:3`** lost a word to a slip:

```
-// the url is content-addressed, so it can be immutable, and the route
+//  url is content-addressed, so it can be immutable, and the route
```

Note the doubled space. Restore `the`.

## 7 · The comment trim took four load-bearing facts with it

These are judgement calls and the trimming instinct is right — the comments were
long. But each of these carried a fact that exists nowhere else in the code, and
three of them are the reasons behind constraints 1e is about to lean on. Restore
the fact; keep the shorter prose.

| File | What was cut | Why it matters |
|---|---|---|
| `src/repos/header.ts:3` | "one ls-tree per page, cached on the tip's OID" | The only record that the header costs one spawn and is cached. 1e's spawn budget is asserted at 12 per render. |
| `src/repos/tree.ts:3` | "which is the whole reason CLAUDE.md caps a render at twelve spawns" | Same budget, seen from the other side. Without it the four-times-slower claim reads as trivia. |
| `src/html/filename.ts:3` | "no whitespace between the runs: a newline inside `README.<span>md</span>` becomes a space in the accessible name, the clipboard, and find-in-page" | A warning against a specific edit — removed in the same commit that added indentation to every other HTML template. |
| `src/repos/header.ts:20` | `maxHeaderBytes` — "what the 100 KB budget leaves after fonts and the page" | The replacement inverts the derivation. 16 KB is not chosen to leave room; it is what remains. `docs/BRAND.md` 06 has the reconciled arithmetic. |

`src/repos/wordmark.ts` and `src/git/oid.ts` lost their `BRAND.md 06` citations
and a sentence each. Lower stakes — restore the citations at least, since the
docs are the source of truth and a comment that names its clause is how a reader
gets there.

## 8 · The repo-index fence was deleted rather than corrected

`src/repos/list.ts` lost its whole four-line comment. It was wrong in two
specifics — it cited `PLAN.md:215` where the line is **217**, and it named
`rev-list --count`, which paginates *git* output and cannot paginate a Postgres
table — but its purpose was to stop someone importing the file tree's
sixteen-row cap into the repo index, and that hazard did not go away.

Restore it, corrected:

```ts
// the index is uncapped at MLP. the file tree's sixteen-row cap reasons
// about repo-root entry counts and does not transfer to how many repos an
// install has. when one outgrows a page the answer is a keyset cursor on
// lower(name) — unique by repos_name_lower_key, so it needs no tiebreak —
// never a cap borrowed from the tree
```

Do not build the pagination. the 1e brief (not yet in `docs/phases/`) carries this as part of
the collation section, and its check 27 asserts the corrected comment.

## 9 · Refusal copy: two regressions and a pending change

`src/html/error-page.ts`:

- `badRepoName.next` lost its recovery path. It read "…up to 64 characters.
  Check the URL, or find the repo in all repos." and now stops at the character
  count. The `All repos` link below still exists, but the sentence that tells
  someone what to do with it is gone. Restore the second half.
- "A name is **comprised of** letters, digits…" — `comprised of` is the one
  usage the construction does not have. "A name is letters, digits, dots,
  dashes, and underscores" was already right; if it needs a verb, "composed
  of".
- `noSuchRepo.next`: "Find it in all repos." became "Try and find it in all
  repos." Weaker and informal. Your call, but it reads as a hedge in a place
  the old copy was direct.

**Both refusal strings still say 64 characters**, here and at
`refusals.badName` in `src/ssh/exec.ts`. That is correct today and changes in
1e. `docs/LAYOUT.md` now names both files and the `{0,39}` quantifier so the
pair cannot be half-updated.

## 10 · `scripts/docs-artifact.mjs` breaks the single-instance contract

`test/contract/markdown.contract.ts` check 21, "one configured instance serves
the whole repo", enumerates every file constructing a `MarkdownIt` and now
finds three where it expects two:

```
+ 'scripts/docs-artifact.mjs',
  'src/markdown/render.ts',
  'test/contract/markdown.contract.ts'
```

The check's intent is that no second, differently-configured parser reaches a
served page — and a docs build script is outside that. But the check as written
scans the repo, so it is failing on a true statement about a file it was never
aimed at.

**Decide, and say which:** either narrow the enumeration to `src` and `test`
with a comment explaining why a build script is out of scope, or add the script
to the expected list with the same explanation. Do not delete the check. Do not
make `docs-artifact.mjs` import the server's instance — the docs need `table`
and heading anchors that the served renderer deliberately does not have, and
coupling them would be the actual hazard.

## 11 · Tuffgal still captures one breakpoint; two are specified

`tuffgal.config.ts` declares `breakpoints: [{ name: "desktop", width: 1440 }]`.
`docs/BRAND.md` §05 now specifies **375 and 1440**, and
the 1e brief check 19 requires both, noting that every baseline
re-shoots when the second lands.

This is a known open item, not a regression — it was open before these commits.
Flagged so it is not mistaken for settled. **Leave it for 1e**; landing it here
re-shoots every baseline mid-review.

The same commit stripped four explanatory comments from that file, including
"BRAND.md's 1440 is not in tuffgal's registry, whose desktop is 1280" — which
is the reason the override exists. Restore that one.

---

## Not defects — recorded so they are not re-litigated

- **`src/repos/access.ts`** landed as written. Its test is 1e's check 29: a fake
  `AccessStore`, four cases, and the owner case asserting the fake was never
  consulted.
- **The `/images/:image` route and its tests are good work.** Seven checks pass,
  including a traversal case asserting no path leaks into the 404 body, and a
  budget check that counts only `favicon.png`. That model matches
  `docs/BRAND.md` 06 exactly: 4,610 B of the 102,400, with 21,884 B left.
- **The stylesheet got smaller.** See §2.
- **`biome.json`'s `images/**/*.svg` override matches nothing** — the directory
  holds PNG, ICO and JPEG. Harmless if it is forward-looking; delete it if it
  was aimed at something else.
- **The `.gitignore` additions are correct.** `build/`, `tuffgal/.cache/`, and
  `tuffgal/report/` replace a dead `tuffgal/.gitignore` line, and they are what
  makes `npm run format` quiet — Biome reads the root ignore file, and those
  three directories were contributing 85 of its 88 diagnostics.
- **The HTML indentation pass is safe as landed.** No indentation entered a
  `<pre>`, a `.sc` run, or any other whitespace-sensitive position. It is
  reviewed, not merely untested.
- **The Easter egg in `src/html/repo-show.ts`** — `<!-- (⌐■_■) real punks don't
  indent their READMEs -->` — ships on every repo page with a README, about
  55 bytes. Entirely your call; noted only because it is in the wire bytes the
  1e budget counts.

## Verification

Before the next push, all of this:

```
npm run build
npm test
npx biome check .
sh scripts/verify-phase-1d.sh
```

`npm test` currently fails eleven assertions across
`unquoted-attribute`, `tokens`, `fonts`, `fonts-budget`, `markdown`, and
`index-failure`. Every one is in scope above. When they pass, say so with the
counts; if any needs a test changed rather than the code, say which and why
before changing it.

`test/contract/index-failure.contract.ts` will also need its regex updated —
the copy legitimately changed from "That page failed to load" to "The page
failed to load", and the test still greps the old string. That one is a stale
test, not a defect in the change.

## Handoff notes

- Which items you disagreed with, and the reasoning
- Anything in §7 you judged genuinely not worth restoring
- Your call on §10, and the comment you left explaining it
- Whether the test count moved, and what it is now

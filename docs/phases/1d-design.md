# Phase 1d · The design system, and two pages that prove it

_The first pages anyone sees. The only phase where your eye is the gate._

Fourth of five briefs making up Phase 1 of `docs/PLAN.md` §08. That
section names one phase for all seven views; it is split here because
1d settles every visual decision against two pages you can judge, and
1e applies a settled system to five more.

| Sub-phase | Scope | State |
|---|---|---|
| 1a | Schema, Fastify skeleton, `html` tag | Merged — PR #1 |
| 1b | SSH listener, auth, push-to-create | Merged — PR #2 |
| 1c | Anonymous smart-HTTP | Merged — PR #4 |
| **1d** | Design system, repo list, repo show | This document |
| 1e | Blob, commit log, diff, branch and tag lists | Next |

**Read `.claude/CLAUDE.md` first, in full**, then `docs/BRAND.md`, then
`docs/STACK.md`. `BRAND.md` is not reference material for this phase — it
is the specification. `docs/LAYOUT.md` covers the two directions and the
small-caps recipe.

---

## Version reconnaissance

Verified 2026-08-27. If `npm install` resolves outside these majors,
**stop and report it**.

| Package | Verified | Major | Note |
|---|---|---|---|
| `markdown-it` | 15.0.0 | **15** | **New major. Spike it first — see below.** |
| `highlight.js` | 11.12.0 | **11** | Not needed until 1e. Do not install it yet. |
| `tuffgal` | 0.2.0-alpha.8 | **0** | Pre-1.0, unstable API by its own README. Pin the exact version. |

New dependencies this phase: `markdown-it`, `tuffgal`, `axe-core`, and
`playwright`. Nothing else.
Archivo was already in `fonts/`; the mono face was not, and this phase
builds it — see `fonts/README.md`. `@types/markdown-it` was installed and
then dropped, because 15 is self-typed. `docs/STACK.md` records why; don't
add it back.

## Before anything else: the markdown-it spike

`docs/STACK.md` records this as blocking, and CLAUDE.md's markdown-it
gotchas were written against 14.x. **The first task of this phase is a
throwaway spike against the installed 15.0.0**, answering four questions,
before a line of the pipeline is written:

1. Does `new MarkdownIt('commonmark')` still set `html: true`? Pass
   `{ html: false }` explicitly regardless, but establish the fact.
2. `validateLink` moved from an instance property to a prototype method in
   15. Does assigning `md.validateLink = fn` still shadow it? **Prove the
   allowlist actually rejects `javascript:`** — do not infer it from the
   assignment appearing to work.
3. Is `text_join` still the last core rule, and does
   `md.core.ruler.before('text_join', ...)` still position a rule
   correctly? Cross-reference autolinking is 1e's problem, but the answer
   belongs in the same spike.
4. Does an escaped `\#12` survive un-linked?

Report all four. Then amend CLAUDE.md's markdown-it section with what you
measured — it currently describes 14.x and is the last stale section left.

## What 1d is

The whole visual system, and the two pages that exercise it:

```
GET /            repo list — the site index
GET /r/:repo     repo show — file tree at the default branch + rendered README
```

Plus everything they need: the stylesheet from `BRAND.md`'s token block,
self-hosted Archivo and Carn Mono (a renamed IBM Plex Mono subset — OFL
reserves the name "Plex"), both themes, compensated small caps, the
generated wordmark, and header-image resolution.

## What 1d is not

- Blob view, syntax highlighting, commit log, diff, branch and tag lists —
  all 1e. **Do not install `highlight.js`.**
- Issues, PRs, or anything they need — Phases 3 and 4
- `/new`, `/settings`, `/r/:repo/settings` — admin forms, later
- Atom feeds, `robots.txt`, `sitemap.xml` — later
- Cross-reference autolinking (`#12`) — 1e, though the spike answers its
  question now
- Any change to the SSH or HTTP git paths. If either needs a fix to make
  1d work, say so rather than editing it in passing.

## Standing rules

- Every migration file starts with `BEGIN;` and ends with `COMMIT;`
- `.squawk.toml` holds environmental facts only; silencing is inline
- The init migration's `require-lock-timeout` /
  `require-statement-timeout` ignore does not carry forward
- Findings sort into lifecycle artefact / capacity ceiling / correctness;
  correctness findings are never silenced
- The verify script must be idempotent — scratch database, `mktemp -d`
  repo root, ephemeral ports, one trap
- `git grep` for `shell: true` uses 1a's **scoped** form, path-limited to
  `src test scripts prisma`, with a positive control. The literal string
  appears in the docs, so an unscoped grep can never pass.

---

## The escaping gate this phase owes

1a's brief carries a correction: the five-character escape set is correct
**only if every attribute value in every template is quoted**. An unquoted
value is also terminated by a space, a tab, `=`, or a backtick, so
`foo onmouseover=alert(1)` interpolated into `<a href=${x}>` renders as a
live event handler.

1d is the first phase with templates, so 1d owns the enforcement:

**A contract test that scans template source for an interpolation landing
in an unquoted attribute position, and fails.** Static, zero runtime cost.
Give it a positive control — a fixture with `href=${x}` that the scanner
must catch — so a scanner matching nothing cannot pass.

This is not optional and it is not deferrable. 1c shipped an injection
defect that built clean, passed 61 tests, and passed its verify script
twice, because no gate looked for that class. 1d renders user-controlled
data — repo names, descriptions, commit subjects, README bodies — into
HTML on every page.

## Markdown

Strict CommonMark, one deviation: `table` enabled, nothing else.

- `new MarkdownIt('commonmark', { html: false })` — always explicit
- Replace `validateLink` with an **allowlist** (`https`, `http`, `mailto`,
  plus data-image forms). The default is a blocklist of four schemes,
  which fails open.
- README rendering is `raw()`'s only caller in this phase. Everything else
  goes through `html` and is escaped.
- No sanitizer. CLAUDE.md §04 explains why: with `html: false` there is no
  raw HTML to sanitize, and adding one implies there is.

## Type, and the thing most likely to go wrong

`BRAND.md` §03 and `LAYOUT.md` carry the small-caps recipe. The part that
gets lost:

- **`letter-spacing` stays.** Real small caps keep full-size sidebearings
  rather than scaling them.
- **`"case" 1`** lifts `. - /` to cap alignment, which paths need.
- **The DOM keeps the true lowercase.** `text-transform` is display-only
  by spec, so selection, copy-paste, Ctrl-F, and screen readers all get the
  real filename.
- **Pin `lang="en"` on filenames.** Under Turkish, `i` uppercases to `İ`.

The display face never sets body copy. On the list, it is worn by the repo
names; on the show page, by the single title. Everything else is mono,
small, and quiet.

## Themes

The token block in `BRAND.md` is copied **verbatim**. It is built so all
three theme states resolve — explicit dark, explicit light, and the
unstamped system default — and no colour is defined only inside a media
query. Changing its structure breaks a case that is invisible in testing.

Theme is a cookie; the server reads it and picks. No client-side
switching, no flash, no JavaScript. A `<noscript>` is not needed because
nothing needs script.

## Budgets

CLAUDE.md's four are contract tests, not aspirations. This is the phase
where they start binding:

- **Zero client JavaScript on the critical path.** The wordmark is
  server-rendered SVG.
- **Under 100 KB per page**, fonts included. Two families, subset.
- **Under 100 ms TTFB** on a warm repo page.
- **Fewer than 12 `spawn` calls per render.** The file tree is one
  `ls-tree -z --long`, not one `cat-file` per row. This is the budget most
  likely to be broken by code that looks correct.
- **Zero axe violations**, both themes.

---

## Tuffgal

First phase with anything to screenshot, so Tuffgal enters here rather
than at Phase 4 — nine screens arriving at once is where a wrong baseline
hides.

- Stories for both pages, in **both themes**
- The fixture repo must be **byte-reproducible**: build it once with
  `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` pinned, and commit the bare
  repo as a tarball
- **Freeze the clock.** Every page carries relative timestamps, and an
  unfrozen clock makes every baseline fail tomorrow
- **CI is the sole writer of baselines.** A locally-written baseline is
  how a regression becomes the new normal. Establish this now, with two
  screens, rather than later with nine.

Tuffgal is pre-1.0 with an explicitly unstable API. If its README and its
actual behaviour disagree, **report it rather than working around it** —
Nick maintains it, and a wrong workaround here becomes a bug report he
never receives.

---

## Exit criteria

`scripts/verify-phase-1d.sh`, printing `PASS`/`FAIL` per check, exiting
non-zero if any fail. Idempotent, on the pattern 1a through 1c settled.

1. `npm ci && npm run build` — zero errors under `strict`
2. `GET /` returns 200 and lists every repo in the database
3. `GET /r/:repo` returns 200 with the file tree at the default branch and
   the rendered README
4. A repo with no README renders the tree and an empty state that says
   what would be here and how to make one
5. A nonexistent repo returns 404; an invalid name is refused before any
   database query
6. **No interpolation lands in an unquoted attribute position** — source
   scan, with a positive control proving the scanner catches a planted one
7. A repo named with an escape sequence never reaches a response body
8. A README containing `<script>`, `javascript:`, and `<img onerror=>`
   renders inert — assert the output, not the absence of an error
9. `validateLink` rejects `javascript:` — the allowlist, proven, not the
   assignment
10. Both themes render: `data-theme="dark"`, `data-theme="light"`, and
    unstamped, all three resolving to a complete palette
11. **Zero axe violations across all three theme states** —
    `data-theme="dark"`, `data-theme="light"`, and unstamped. Run against
    the gallery as well as both pages. Prove the harness bites: a fixture
    with a known contrast failure must be reported. A run that finds
    nothing because axe never loaded is indistinguishable from a pass.
12. **Under 100 KB per page**, fonts and all
13. **Fewer than 12 `spawn` calls** rendering a repo page — instrument the
    wrapper and count
14. Zero `<script>` tags on either page
15. The DOM under small caps holds the true lowercase, and filenames carry
    `lang="en"`
16. Tuffgal stories pass for both pages in both themes, against the pinned
    fixture and a frozen clock
17. `git grep` finds no shell-enabled spawn — scoped form, positive control
18. Every `.ts` under `src`, `test`, and `scripts` opens with the SPDX line
19. `package.json` adds only `markdown-it`, `tuffgal`, `axe-core`, and
    `playwright`. `axe-core` and `playwright` are devDependencies;
    `@types/markdown-it` and `@axe-core/playwright` are not installed.
20. `npx squawk prisma/migrations/**/*.sql` exits 0
21. 1a, 1b, and 1c verify scripts all still pass in full
22. Running this script twice gives the same result, leaving no
    `carn_verify_%` database, no rows beyond the admin seed, and no
    directory under the temporary repo root

Checks 6 through 9 are the phase's real gate. Each covers a failure that
is invisible when it happens: a page renders, looks right, and is wrong.
Check 13 is second — a file list calling `cat-file` per row is
pixel-identical and four times slower.

## What only Nick can judge

Every check above is mechanical, and none of them says whether it looks
good. That gate is his, and it is the one this phase exists for.

Make it easy to reach: when the phase is done, give him the exact commands
to see both pages in both themes with a repo that has real content in it.
Not screenshots — the running thing.

## Handoff notes

- All four answers from the markdown-it spike, and what you amended in
  CLAUDE.md
- Whether `@types/markdown-it@14` matched the 15.0.0 runtime API. Answered
  ahead of the handoff: it did not, and the dependency was dropped
- Any place Tuffgal's README and behaviour disagreed
- Any place CLAUDE.md, `BRAND.md`, `docs/STACK.md`, and this brief
  disagreed
- Anything you wanted to add and did not, with the reason

If something here is wrong about the world, **stop and say so.** Several
amendments in every phase so far have been defects in the brief rather
than the code — including one that would have killed git on every clone.

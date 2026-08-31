# Phase 1e · The five remaining git-reading views

_Everything left that only reads. After this, Phase 1 is done._

Fifth and last of the briefs making up Phase 1 of `docs/PLAN.md` §08.

| Sub-phase | Scope | State |
|---|---|---|
| 1a | Schema, Fastify skeleton, `html` tag | Merged — PR #1 |
| 1b | SSH listener, auth, push-to-create | Merged — PR #2 |
| 1c | Anonymous smart-HTTP | Merged — PR #4 |
| 1d | Design system, repo list, repo show | In review |
| **1e** | Blob, log, commit, branch and tag lists | This document |

**Read `.claude/CLAUDE.md` first, in full**, then `docs/BRAND.md`, then
`docs/LAYOUT.md`, then `docs/STACK.md`. All four were audited and corrected
after 1d; where any two disagree now, say so rather than choosing quietly.

**The Markdown is the source of truth.** Each doc's line 1 says so, and
`scripts/docs-artifact.mjs` regenerates the published pages from it. If you
change a doc, re-run that script and say so in the handoff.

---

## Version reconnaissance

Verified 2026-08-28. If `npm install` resolves outside these majors,
**stop and report it**.

| Package | Verified | Major | Note |
|---|---|---|---|
| `highlight.js` | 11.12.0 | **11** | New this phase. Latest is still 11.12.0 — no drift since `STACK.md` recorded it. |
| `markdown-it` | 15.0.1 | **15** | Patch bump from the pinned 15.0.0. Read the changelog before taking it; the 1d spike's four answers were measured against .0. |
| `tuffgal` | 0.2.1-alpha.1 | **0** | Pin exactly. Still pre-1.0 with an unstable API. |
| `prisma` | 7.x | **7** | `latest` is **8.0.0-rc.12**. The standing hazard: never install Prisma by tag. |

New dependencies this phase: **`highlight.js` only.** Nothing else.

## What 1e is

```
GET /r/:repo/blob/:rev/*        highlighted source
GET /r/:repo/commits            the log, ?ref= to scope, SHA-cursor paginated
GET /r/:repo/commits/:sha       one commit: file list, then diffs
GET /r/:repo/commits/:sha/*     one file's diff, for the ones that did not fit
GET /r/:repo/branches           each row links to the log scoped to that ref
GET /r/:repo/tags               same; a tag gets its own page in Phase 5
```

**Two ref routes, not four.** A branch "detail" page would show the log scoped
to that branch, which `/r/:repo/commits?ref=<name>` already is — and a detail
route would need an escaping scheme, because ref names contain slashes and
`/r/:repo/branches/feature/some-fix` is indistinguishable from a nested path.
`PLAN.md` chose `?ref=` precisely to keep a ref out of a path slot. Do not
reintroduce the problem it solved.

Plus the decisions carried from the 1d review, and the extractions 1e's call
sites finally justify.

## What 1e is not

- Issues, PRs, or anything they need — Phases 3 and 4
- `/new`, `/settings`, `/r/:repo/settings` — admin forms, post-MLP
- `/r/:repo/archive/:rev.tar.gz` — the tightest rate-limit zone, and nothing
  needs it yet
- Atom feeds, `robots.txt`, `sitemap.xml` — later
- Any change to the SSH or HTTP git paths. If either needs a fix, say so
  rather than editing it in passing.

## Standing rules

- Every migration file starts with `BEGIN;` and ends with `COMMIT;`
- `.squawk.toml` holds environmental facts only; silencing is inline
- Findings sort into lifecycle artefact / capacity ceiling / correctness;
  correctness findings are never silenced
- The verify script is idempotent — scratch database, `mktemp -d` repo root,
  ephemeral ports, `trap cleanup EXIT INT TERM`
- `git grep` for `shell: true` uses 1a's **scoped** form, path-limited to
  `src test scripts prisma`, with a positive control
- Shell out to plumbing, never porcelain
- **Nick's edits are not review findings.** If a change reverses something he
  wrote deliberately — wording, naming, comment prose, structure — raise it and
  stop. Fix it only when the current text contradicts a measurement, a binary,
  or a source-of-truth doc, and say what it contradicted. `.claude/CLAUDE.md`
  carries the full rule

---

## The problem this phase is actually about

A highlighted blob does not fit the page budget as that budget is currently
measured. Measured across 46 files sampled evenly through Linklater's 832-file
TypeScript corpus, highlight.js 11.12.0, class-based output:

```
9,694 source lines · 368,822 source bytes

highlighted, raw      1,077,103 B   111.1 B/line   2.92x expansion
highlighted, gzip -5    106,519 B    11.0 B/line   9.9% of raw

wire-byte room for blob content        26,494 B  ->  ~2,400 lines
Linklater files that fit whole          46 of 46
```

`PLAN.md` said 199 B/line; it now says 111, corrected against that corpus.
Every file in the repo fits, including the 147,863-byte generated `User.ts` —
which compresses to 3% because it is so repetitive.

**The budget is wire bytes, at gzip level 5.** Level 5 is Caddy's `encode gzip`
default, so the test can never flatter production. The spread from level 1 to
level 9 is 2.3 percentage points, so this is a choice about honesty rather than
about bytes. Fonts count whole — woff2 is Brotli inside and does not shrink.

Three mechanisms, in this order:

**1 · Minify the stylesheet at serve time.** 12,878 B → 9,594 B, free, and a
serve-time transform so `BRAND.md`'s token block stays byte-identical to
`styles.ts` and its contract test keeps passing. Do not minify the source.

**2 · Count wire bytes.** `repo-page.contract.ts:543` measures
`Buffer.byteLength(markup, "utf8")` — uncompressed, against a budget describing
what a visitor downloads on a cold cache. Nothing compresses yet because the
Caddyfile is Phase 2. Compress in-process at a fixed level as the stand-in, and
**record in `docs/PLAN.md` that Phase 2's Caddy must then compress at least as
well** — the test becomes a promise about production the moment it does this.
Fonts are woff2, already Brotli inside; they do not shrink and stay counted.

**3 · Truncate, and offer the rest.** The cap is **computed, not a constant**:
`remaining = budget − (fonts + stylesheet + chrome)`, so it tracks automatically
when the stylesheet changes. Four cases:

| | render | escape hatch |
|---|---|---|
| Text under cap | whole | — |
| Text over cap | first `remaining` bytes, broken on a line boundary | `Show entire file` |
| Binary under cap | inline, `loading="lazy"`, plus metadata | `Open raw` |
| Binary over cap | metadata and "too large to show here" | `Open raw` |

`loading="lazy"` defers bytes, it does not remove them. Keep it for
time-to-first-render; do not count it against the budget.

The header image stays inside the budget. That was the decision, and these
three are what make it affordable rather than a slip.

**Both escape hatches are gated, and neither works at MLP.** They point at
`gelatinous-cube`, and nothing serves there — the DNS records are a Phase 2
pre-flight. Read `CARN_RAW_ORIGIN` from `config.ts`; unset, the link is simply
not rendered. The view is complete either way and Phase 2 turns it on with one
variable. Row four is the thin one until then: metadata and no way through.
That is known and accepted, not a gap to solve here.

**Inline images do not come from that origin.** CSP is `img-src 'self' data:`,
so a second hostname is blocked, and widening `img-src` would undo the
isolation the origin exists for. Serve a small image blob first-party through
the content-addressed immutable route `/r/:repo/header/:asset` already
established, including its `committed()` guard against reading an arbitrary
OID. Generalise that route; do not write a second one.

## The four carried decisions

**Repo name cap → 40.** A typographic bound: what the generated mark can draw
legibly, not what the identifier grammar allows. Five sites move in one commit:
`namePattern` in `src/repos/resolve.ts`, the `CHECK` in the init migration,
**two** pieces of refusal copy — `badRepoName.next` in `src/html/error-page.ts`
and `refusals.badName` in `src/ssh/exec.ts`, both saying "64 characters" today —
and `BAD_NAME` in `verify-phase-1b.sh:22` and `verify-phase-1c.sh` (check 12
greps that exact string). **Change the number, not the sentence.** Those two
strings were rewritten by Nick and then reverted by a review item that
overstepped; their wording is his to set, so swap 64 for 40 and leave every
other word alone. The length checks need no change — 1b, 1c,
and 1d each assert a **65**-character name is refused, true at any lower cap.
1e adds the boundary pair: **40 accepted, 41 refused.**

The quantifier is the place this goes wrong. The pattern is one anchor character
plus a repeat: `{0,63}` is a 64-character cap, so 40 is `{0,39}`. Both copies —
`namePattern` and the `repos_name_format` CHECK — must move together, and the
CHECK is the one nothing in TypeScript will catch.

**Both lists become `<table>`.** Decided by Nick, and the reason is reach
rather than tidiness: a table renders as a table everywhere — an old phone, a
terminal browser, an email client, anything that never got the stylesheet —
where a `<ul>` over a CSS grid collapses to a list of runs. The semantics are
the honest ones too, once 1e fills the commit-subject and age columns.

`<thead>`, `scope="col"`, real `<th>`. `BRAND.md:562` already specifies `--ink`
for the rule under a heading that opens a table, so the design was drawn for
this. `best-practice` brings `empty-table-header`, `scope-attr-valid`, and
`table-duplicate-name`, dormant until now and live the moment you land it.
`docs/PLAN.md` §04 recorded this as an open decision through 1d and now records
it as made — read the current line, not a cached memory of it.

**The row overlay retires with it.** Do not port `.nm::after` into a `<tr>` —
`position: relative` on a table row is patchy in WebKit, and you do not need
it: `BRAND.md:645` already says the subject and age become links to the commit
in this phase. Three cells, three links, no overlay. The overlay stops being a
concept rather than becoming a Safari bug.

**Tuffgal captures two breakpoints, 375 and 1440.** They bracket the
stylesheet's single `min-width: 640px` query, which is a complete test of the
only responsive decision the CSS makes. 375 is tuffgal's `mobile`; 1440 is a
project override of its `desktop`, which the registry puts at 1280. Four
captures per story once the two colour schemes are counted. **Every baseline
re-shoots** — do this before capturing anything else in the phase.

## The name column, and why it is edited in place

Nothing in the project pins a collation. There is no `COLLATE` on
`repos.name`, no `POSTGRES_INITDB_ARGS`, and no locale in `compose.yaml`, so
every database inherits whatever its host's `initdb` chose. Production is
`postgres:18-alpine` — musl, whose locale support is a stub and therefore close
to `C`. A Homebrew dev database is whatever `initdb` inherited, in practice
`en_US.UTF-8` with real ICU.

That is a difference with a visible consequence. `ORDER BY lower(name)` in
`src/repos/list.ts` fixes the **case** question and not the **punctuation** one,
and `namePattern` permits `.`, `-`, and `_`. So `my-repo`, `my.repo`, and
`myrepo` can order one way on a laptop and another in the container, with no
code change between them, and the failure surfaces as a repo list that looks
wrong in production and right locally.

**Pin it in the init migration itself, not in a new one.** The column becomes:

```sql
"name" TEXT COLLATE "C" NOT NULL,
```

`"C"` because it exists in every Postgres build, musl included, and because
byte order over UTF-8 is code-point order — it is deterministic rather than
arbitrary. The unique expression index `repos_name_lower_key` needs no change:
`lower(name)` inherits the column's collation, so the ordering it defines is now
the same everywhere. The `repos_name_format` CHECK needs no collation thought
either — its character classes are explicit ranges, not `[[:alpha:]]`, so ctype
does not enter into it.

**The second thing the pin buys is pagination.** The repo index is uncapped at
MLP and the comment at `src/repos/list.ts:3` says so, but it names
`rev-list --count` as the eventual answer, citing `PLAN.md:215`. Both halves are
wrong and both want fixing in this phase, because 1e is the phase that builds
the pagination the comment was pointing at.

The citation is off by two — the `rev-list --count` sentence is `PLAN.md:217`.
And the mechanism belongs to a different data source. That sentence sits under
"Reading repos — process spawn cost is the whole story," and everything in it
paginates output from **git**: the commit log, which is this phase's
`/r/:repo/commits` and correctly uses it. The repo index touches no git at all.
It is `SELECT name, description, created_at FROM repos`, a Postgres table, and
no git command paginates one.

What it should say is a keyset cursor on `lower(name)`:

```sql
WHERE lower(name) > lower($1) ORDER BY lower(name) LIMIT $2
```

`repos_name_lower_key` already makes `lower(name)` unique, so this needs no
tiebreak column — which is the whole reason it is the right key. But it is
only correct once the collation is pinned. A keyset cursor asks the database
what comes *after* a value, and if two hosts disagree about that ordering the
cursor skips rows on one and repeats them on the other, at the page boundary,
where it is least likely to be noticed. This is the same defect as check 6's
SHA-cursor requirement for the log, arriving from a different direction.

Replace the comment's last clause accordingly. Do not build the pagination —
the index is uncapped at MLP and that has not changed. Fix what the comment
promises, so the next person to need it starts from the right mechanism.

Editing an applied migration is normally wrong, and here it is right exactly
once. Prisma records a checksum per migration, so any database that has already
run `20260824223229_init` will fail `migrate status` after this and must be
reset. That costs nothing today: the verify scripts each build a scratch
database, and **no database exists yet that outlives a test run** — Phase 2
creates the first one. Do it now or carry an `ALTER TABLE ... TYPE ... COLLATE`
and a table rewrite forever. The CHECK quantifier change above goes in the same
edit, in the same file, for the same reason.

Two things to say out loud in the handoff. `prisma migrate reset` is required on
any dev database, and the migration's own header — "hand-tuned, a regeneration
must preserve all of it" — now covers two more hand edits. `users.handle` has
the same exposure and is deliberately **not** changed here: nothing orders it
yet, and 1e adds no view that does. Note it; do not fix it.

## Raw SQL and the Prisma DSL

Five raw call sites exist outside `src/generated`. Two go, three stay, and the
rule is worth more than the diff:

> Raw SQL is permitted where the DSL is **wrong**, or where it has **no form**
> for the statement at all. Nowhere else, and never for brevity. Every raw
> query carries a comment naming the DSL construct it rejects and what that
> construct would have done.

Record that rule in `docs/STACK.md` and re-run `scripts/docs-artifact.mjs`.

| Call site | Verdict |
|---|---|
| `src/repos/resolve.ts:34` | **Stays.** The DSL is wrong — twice. |
| `src/repos/list.ts:17` | **Stays.** The DSL cannot express the sort. |
| `test/support/visual-db.ts:46` | **Goes.** `db.user.findUnique({ where: { handle: "nschneble" } })`. |
| `test/support/visual-db.ts:62` | **Stays.** `TRUNCATE` has no DSL form. |
| `test/support/visual-db.ts:65` | **Goes.** `db.repo.createMany`, one round trip instead of N. |

**`resolve.ts`.** The comment on line 33 gives half the reason; it should give
both. Prisma's `mode: "insensitive"` compiles to `ILIKE`, and `namePattern`
permits `_`, which `LIKE` reads as a single-character wildcard — so
`db.repo.findFirst({ where: { name: { equals: "my_repo", mode: "insensitive" } } })`
resolves a repo actually named `myXrepo`. A repo would be reachable under a name
it does not have. Second: `ILIKE` cannot use `repos_name_lower_key`, so every
resolve becomes a sequential scan, and resolve runs on every git request, HTTP
and SSH alike.

**`list.ts`.** Prisma's `orderBy` takes columns, not expressions, so there is no
DSL spelling of `lower(name)`. `orderBy: { name: "asc" }` sorts the raw column,
and under `COLLATE "C"` that puts every capital above every lowercase — `Zebra`
before `apple`. Sorting in Node instead would pass today only because the index
is unpaginated; `PLAN.md` 215 already says pagination is the answer when it
outgrows a page, and the sort would have to come back to SQL then. Keep the
query, and give it a comment of the shape the rule asks for.

**`visual-db.ts:62`.** `TRUNCATE ... CASCADE` is a statement the DSL has no
form of, and `deleteMany({})` is a different operation, not a translation. Note
in passing that `RESTART IDENTITY` is inert here — every key is a UUID and
`next_number` is a plain default, so nothing has an identity to restart. Leave
the clause or drop it; do not leave it there believing it does something.

**`visual-db.ts:65`.** The `::uuid` casts exist only because the raw path needs
them. They go with the query.

## The extractions 1e finally justifies

The first two were deferred in 1d as larger than a wrap-up. This phase triples
their call sites, so now is when.

- **`src/git/capture.ts`** — spawn, collect stdout, `stderr.resume()`, check
  outcome is the same body in three files today and six after log, diff,
  branch, and tag lists. Export `captureGit({ args, cwd, signal, timeoutMs, limit? })`.
- **`parseLsTree`** — the `-z --long` parser (split NUL, split tab, split
  whitespace) is independently reimplemented twice. One function returning
  `{ mode, type, oid, size, path }[]`; each caller filters.

Do these first, before the views, or you will write the third and fourth copy.

**`src/repos/access.ts` is already written**, on the `phase/1d` working tree
and untracked. It moves `mayWrite` out of `src/ssh/exec.ts`, where the
authorization policy — owner, or admin, or a grant at `write`/`admin` — was
encoded as the shape of a Prisma query inside a module whose job is parsing and
running git commands. `exec.ts` loses its `db` import with it, so nothing under
`src/ssh/` touches Prisma except `server.ts`'s `KeyStore` adapter.

It is modelled on that adapter deliberately: an `AccessStore` port, a concrete
`accessStore`, and `mayWrite(repo, userId, store = accessStore)`. The call site
in `exec.ts` is unchanged; the third parameter exists so the policy can be
tested without a database. Two details worth not undoing — the owner check sits
**above** the store call, so ownership costs zero round trips, and `writeLevels`
is a named constant because `grant_level` has exactly two members today and the
list that must not gain `read` should be a declaration rather than a literal
inside a `where` clause.

**What 1e owes it is the test**, which does not exist. Build a fake on the
shape of `test/contract/ssh-auth.contract.ts:67` — the store plus an array
recording what it was asked — and assert four things:

| case | expected |
|---|---|
| `userId` is `repo.ownerId` | `true`, **and the fake was never called** |
| not owner, `isAdmin` | `true` |
| not owner, grant at `write` or `admin` | `true` |
| not owner, no row at all | `false`, not a throw |

The first row is the one that matters and the one a database-backed test cannot
make: it is the difference between an owner push costing zero queries and
costing one, and nothing else in the suite would notice the day it regresses.
The last row pins the deleted-mid-connection case that the `?.` chain handles
silently.

If the module rides into the 1d PR rather than this one, 1e still owns the
test — say which happened in the handoff.

## Carried from 1d's deferred batch

- **The file tree's right-hand columns.** `LAYOUT.md:70` and `PLAN.md:468`
  specify last-commit subject at 190px and age at 46px. One bounded
  `git log --name-status` walk attributes every path — **not one spawn per
  row**; the spawn budget is not the obstacle, TTFB is. Bound it with
  `--max-count` and leave un-attributed paths blank rather than walking forever.
- **`renderPaths` is still unpinned.** It collapsed to two entries correctly
  when the theme cookie retired, but nothing asserts its length or contents, so
  shrinking it to one still passes. `deepStrictEqual` on the path names, plus a
  verify-script assertion on the reported test count.
- **`CARN_FROZEN_NOW` is never exported by `start_daemon`**, so verify check 2
  does not exercise the frozen clock. Not a one-line wire-up: `repos.created_at`
  defaults to real `now()` at INSERT and is not controllable by that variable.
  Needs a post-seed `UPDATE` to a fixed value, or a computed offset at seed time.
- **The header route has no response oracle.** Nothing proves its 404 shape,
  content-type mapping, immutable `Cache-Control`, 503 path, or the `committed()`
  guard that stops it reading any oid in the repo. SVG-only shrank the surface;
  the gap is still real.
- **`errorPage` sets `og:url` from the failure, not the request.** Each
  `Failure` carries its own `path` — `/404` for the two not-found cases, `/503`
  for the unavailable one — so every 404 shares one canonical and every 503
  shares another. Neither is a route, so following either lands on the page it
  names. `og:url` is a required Open Graph property, so omitting it was not an
  option, and the request path would have invited indexing a bogus URL. If 1e
  adds an error case, give it a path.
- **Cross-reference autolinking.** The 1d spike answered `text_join`'s
  ordering; this is the phase that uses it. An escaped `\#12` must survive
  un-linked — assert it.
- **Gitlinks.** A submodule is neither a browsable tree nor a blob. Detection is
  `ls-tree` mode `160000`; routing is the question, and a directory-style row
  would need a link that 404s. Needs a third `TreeEntry` kind and a display
  decision — raise it, do not invent one.

---

## Relative links and images

`PLAN.md` §04 carries this as a fourth URL-policy item. It landed in 1e rather
than Phase 2 because the route it depends on is 1e's first line.

A README's `[docs](docs/BRAND.md)` renders as a link to `/r/:repo/docs/BRAND.md`,
which is not a route. `allowLink` passes schemeless destinations through
unmodified on purpose — ordinary README content, not a hole — but nothing
rewrites them. The same is true of `![diagram](docs/arch.png)`, and that one is
the visible win: rewriting relative images to the first-party content-addressed
asset route makes **committed images in READMEs work**, under `img-src 'self'`,
with no CSP change.

**Rewrite unconditionally.** Do not check the tree first. An existence check
costs a nested-path lookup per link straight into the 12-spawn budget on a
link-heavy README, makes the same README render differently on different refs,
and buys nothing: a 404 on a link to a file that is not there is the correct
answer, and better than leaving a link that silently points somewhere else
wrong.

Two things this touches. `renderMarkdown` is a pure, context-free function
today with a single production call site at `src/html/repo-show.ts`; it needs a
`{ repo, rev }` parameter. And `test/contract/markdown.contract.ts` currently
pins the unrewritten behavior as intentional — update it in the same commit,
deliberately, rather than discovering it failing.

**This does not touch third-party images.** `![x](https://evil.com/t.png)` stays
blocked by CSP and stays degrading to alt text. That is the privacy control in
`PLAN.md` §04, it is unaffected by the raw-blob origin, and only an image proxy
would change it. Do not widen `img-src` while implementing this.

## The diff

**No compare view.** Nothing at MLP needs branch-versus-branch; Phase 4's PRs
do, and that is when to design it. One commit, one page.

One rule rather than two modes:

> The commit page always shows the header, the message, and the file list with
> per-file `+`/`−`. It then inlines each file's diff in order while the running
> total stays inside the budget. The first file that would overrun, and
> everything after it, stays a link to `/r/:repo/commits/:sha/<path>`.

A one-file commit renders whole. A forty-file commit renders the first several
and links the rest. Same progressive rule as the blob, so there is one concept
to learn, and it degrades by size rather than by a mode switch anyone has to be
told about. No JS — the rest are links, not a load-diff button.

**Show the file list even for a one-file commit.** It carries the `+`/`−`
counts, which the diff body does not summarise, and one rule beats two.

## The breadcrumb

`docs/BRAND.md` §05 now carries the spec. **Implement to it; do not design it.**
The parts most likely to be got wrong:

- It **is** the masthead's `Càrn`, extended — not a new element above it. On `/`
  it is a single current segment and nothing about that page changes.
- `»` is real DOM text, `aria-hidden`, never `content:`.
- Ancestors `--ink-mid` and linked; current segment `--ink`, `"wght" 500`, not a
  link. Three signals, because colour alone dies under forced-colors.
- The 640px collapse is CSS, `display: none`, and the hidden segments leaving
  the accessibility tree is **deliberate** — pointer, keyboard, and screen
  reader then agree on what exists. Do not "fix" it with a scroller.
- It does not replace the `.vh` `<h1>`. They coexist.

## Decisions needed before you start

None. Everything above is settled, the list markup included. If you find
something that needs a decision, **stop and ask** rather than picking.

## Exit criteria

`scripts/verify-phase-1e.sh`, printing `PASS`/`FAIL` per check, exiting
non-zero if any fail. Idempotent, on the pattern 1a through 1d settled.

1. `npm ci && npm run build` — zero errors under `strict`
2. `GET /r/:repo/blob/:rev/*` returns highlighted source with class-based
   markup, and the theme comes from the cached stylesheet, not inline styles
3. All four blob cases behave: text under and over the cap, binary under and
   over. The cap is **computed from the remaining budget**, not a literal —
   change the stylesheet and assert the cap moved
4. A binary blob is never rendered as text; a small image renders first-party
   from the content-addressed route under `img-src 'self'`, unchanged
5. With `CARN_RAW_ORIGIN` unset the escape-hatch links are absent, not broken;
   with it set they point at that origin. Assert both
6. `GET /r/:repo/commits` paginates by **SHA cursor, not `--skip`** — assert
   the cursor, and that page two does not re-read page one
7. The commit page always shows the file list with `+`/`−`, inlines diffs while
   the running total fits, and links the remainder. Assert a one-file commit
   renders whole and a large one links the tail
8. Branch and tag lists render from **one `for-each-ref`**, not N calls, and
   each row links to the log scoped to that ref
9. The file tree's subject and age columns are filled from **one** bounded
    `git log --name-status` walk — instrument and count
10. Every page stays inside the weight budget **as wire bytes at gzip level 5**,
    fonts counted whole and the stylesheet minified
11. Fewer than 12 `spawn` calls per render, on every new view
12. Under 100 ms TTFB on a warm blob and a warm commit
13. Zero axe violations across both render paths, on every new view
14. Both lists are `<table>` with `<thead>` and `scope="col"`; no row overlay
    survives anywhere
15. The breadcrumb: `»` is real DOM text and `aria-hidden`; every ancestor is a
    link and the current segment is not; below 640px the middle segments are
    absent from the layout **and** the accessibility tree, first-two and
    last-two remaining
16. A 40-character name is accepted; a 41-character name is refused, with the
    refusal copy naming 40 — and the 41-character name is refused **by the
    database too**, asserted with a direct insert that the CHECK rejects
17. `renderPaths` is pinned by `deepStrictEqual`, and the verify script asserts
    the reported test count
18. An escaped `\#12` survives un-linked; an unescaped `#12` resolves
19. Tuffgal stories pass at **375 and 1440**, both schemes, against the pinned
    fixture and a frozen clock
20. `captureGit` has exactly one definition and every git caller imports it;
    same for `parseLsTree` and for `mayWrite`. No file under `src/ssh/` imports
    `db` except `server.ts` — `git grep` it
21. `git grep` finds no shell-enabled spawn — scoped form, positive control
22. Every `.ts` under `src`, `test`, and `scripts` opens with the SPDX line
23. `package.json` adds only `highlight.js`
24. `npx squawk prisma/migrations/**/*.sql` exits 0
25. 1a through 1d verify scripts all still pass in full
26. A relative link and a relative image both resolve to the blob and asset
    routes; an absolute link is untouched; an anchor-only or query-only
    destination is left alone
27. `repos.name` collates as `C` — read it back from `pg_attribute` joined to
    `pg_collation` rather than assuming the migration took, and assert a repo
    named `ab-c` lists before one named `abc`. `src/repos/list.ts`'s comment
    names a keyset cursor on `lower(name)` — it already does, in Nick's
    wording; do not rewrite it — and `git grep` finds no `rev-list --count`
    outside the log's own code
28. `git grep` finds `$queryRaw` and `$executeRaw` at exactly the three
    sanctioned call sites outside `src/generated`, each carrying a comment
    naming the DSL construct it rejects
29. `mayWrite` is tested against a fake `AccessStore` across all four cases,
    and the owner case asserts the fake was **never consulted**
30. Running this script twice gives the same result, leaving no
    `carn_verify_%` database, no rows beyond the admin seed, and no directory
    under the temporary repo root

Checks 3, 6, 9, 10, and 27 are the phase's real gate. Each covers a failure that
is invisible when it happens: a hardcoded cap silently stops tracking the
budget, `--skip` pagination is correct until a repo grows, a per-row `git log`
is pixel-identical and an order of magnitude slower, a budget measured on the
wrong bytes passes green while the page is twice its stated weight, and an
unpinned collation is correct on every machine that runs the tests and wrong on
the one that serves the site.

## What only Nick can judge

The blob view is the densest page in the product and the first one that is
mostly other people's text. Whether the highlighting theme sits right against
the palette, whether the truncation point feels arbitrary, and whether a diff
reads at a glance are all his.

Make it easy: when the phase is done, give him the exact commands to see a
blob, a log, and a commit with real content in them, in both schemes.

## Handoff notes

- That `prisma migrate reset` is required on any existing dev database, and
  whether anything other than the init migration's checksum noticed
- Which of `PLAN.md`'s 199 B/line and the measured 70 B/line was right
- The compression level the budget test settled on, and the Phase 2 obligation
  it creates
- Anywhere the four corrected docs still disagreed
- Any exit check you could not make mechanical
- Anything you wanted to add and did not, with the reason

If something here is wrong about the world, **stop and say so.** Every phase so
far has had defects in the brief rather than the code — including one that
would have killed git on every clone, and one that told three documents to use
a colour that fails contrast.

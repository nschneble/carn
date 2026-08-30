<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/bd38dee8-6822-4b2c-a602-bde753e498a3
     is generated FROM it by scripts/docs-artifact.mjs — edit here, re-run that. -->

**IMPLEMENTATION PLAN**

# Build your own forge

**Càrn** — a self-hosted git forge for one person. Repos, issues, and real pull requests with a merge button. Server-rendered, public by default, and with no passwords, sessions, or tokens anywhere in it. Roughly a dozen evenings from nothing to the place your code lives.

## 00 · Three tenets

_What each one commits to_

Each has a concrete, checkable consequence, and two of them fall out of decisions already made rather than costing anything extra.

### 1 · Just be git, with a few conveniences

The commitment: **nothing in a Càrn repository requires Càrn.** No custom refs a stock client has to know about, no metadata objects, no `refs/carn/*` namespace. A repo cloned from Càrn is byte-identical to one cloned from anywhere else. Exit cost is `tar czf repos.tgz /var/lib/carn/repos`.

The tension: **issues and PRs are the conveniences, and they live in Postgres, not in git.** That means "if Càrn vanished" gives you every commit and no issue text. Two mitigations worth taking: the nightly `pg_dump` is as load-bearing as the repo tarball, and an export command (`carn export <repo>` → a directory of markdown files) is a one-evening insurance policy.

### 2 · Fast and responsive is sexy

This one is nearly free, because of a consequence of the decisions above: **with no sessions and no private repos, every read page is identical for every visitor.** No `Vary: Cookie`, no per-user rendering, no authorization check to invalidate. Which means you can put real cache headers on repo pages and let Caddy serve most requests without touching Node at all. Most forges can't do this; it falls out of having no accounts.

A budget worth writing down, so it's a test rather than an aspiration:

- **Zero client JavaScript on the critical path.** Progressive enhancement only — a diff that needs JS to render is a bug.
- **Under 100 KB per page** including the highlighted blob, measured as **wire bytes** — gzip level 5, matching Caddy's default, with fonts counted whole because woff2 is already compressed. This is the real argument for highlight.js over Shiki (§04).
- **TTFB under 100 ms** on a warm repo page. Achievable given the measured numbers — the whole budget is 5–10 git subprocesses at ~2 ms each, so the pooled `cat-file --batch` matters more than anything else you'll do.
- **Cache highlighted blobs by content hash**, and set `Cache-Control: public` on anything keyed by an immutable SHA — a commit page for `a1b2c3d` can be cached forever.

### 3 · Secure and accessible

Security is covered throughout — UUID paths, `html: false`, blob origin isolation, the semaphore, rate limiting (§04). The accessibility list, one item of which constrains the palette:

> **CONTRAST — MEASURED**
>
> **#E7156C on the #F4F6F6 ground is 4.10:1.** That passes AA for large text (3:1) and for non-text UI, but _misses_ the 4.5:1 threshold for body-size text. `--accent` carries only what owes 3:1 — big type, rules, the focus ring — and a darkened **#C9105C (5.22:1)** carries everything that owes 4.5:1: inline links, small type, directory names in a file list, and the fill behind a button, tag, or current chip. `docs/BRAND.md` §02 owns the token split and every measured ratio; this paragraph points at it rather than restating it. In dark mode, **#FF6EA8 on #0E0F0F is 7.36:1** and needs no adjustment.

- **The display face never sets body text.** All-caps removes the ascender and descender profile that word-shape recognition depends on. Uppercase Carn Sans for titles and labels; Carn Sans at `"wght" 400`, or Carn Mono, for anything read as a sentence. There is no third family and no separate body face — see `docs/BRAND.md` §03.
- **Real semantics.** Diffs are tables with row scope. The timeline is an `<ol>`. This is what makes the page work in a terminal browser, which suits the project. The file and repo lists ship as `<ul role="list">` over a CSS grid (`src/html/repo-show.ts`, `src/html/repo-list.ts`); once 1e fills the commit-subject and age columns they become genuinely tabular, and moving them to a `<table>` is an open decision until then.
- **Keyboard first.** A skip link, visible focus on everything (already in the CSS here), and no hover-only affordances — a file row's actions must be reachable by tab.
- **Don't encode meaning in color alone.** Directory-vs-file is pink-vs-ink in the mockups; add a trailing `/` so it survives grayscale and color blindness. Diff add/remove needs `+`/`−` glyphs, not just green and red.
- **No motion at all.** A page that arrives in 80 ms with no JS to parse already _feels_ smooth. Animation is what slow sites use to disguise being slow. The only transitions worth having are hover and focus states, and those should be instant.

### Turning the tenets into tests — Tuffgal, and what it doesn't cover

Unit and integration tests earn little here. [Tuffgal](https://github.com/nschneble/tuffgal) is the instrument. A forge is mostly glue over `git`; the interesting failures aren't "does this function return 4," they're "did the clone work" and "did the page silently change." So: **stories for the journeys, and contract tests for the parts a screenshot can't see.**

> **WHY THIS SUITS CÀRN UNUSUALLY WELL**
>
> Visual regression is normally flaky, and the flakiness has one root cause: nondeterminism in the page. Hydration reordering the DOM, async data arriving late, client state persisting between runs, animation caught mid-frame. **Càrn has none of those by construction** — server-rendered HTML, no client JS on the critical path, no sessions, no motion. The page is a pure function of the request. That makes screenshot diffing genuinely reliable here in a way it isn't for most apps, which means you can trust a red diff instead of re-running it.
>
> Two Tuffgal features earn their keep immediately. **Clock freezing** (`page.clock.install`) is not optional for a forge — every page is full of "6h ago", "3d", "2w", and without a frozen clock every baseline diffs every day. And **a11y-tree snapshots** directly serve tenet 3: they catch the regression where a heading quietly becomes a div, or a table loses its header row, which is exactly the failure mode of a design that leans on semantic HTML.

#### The stories worth writing first

Four, in the order they'd catch the most. Shape below is illustrative — the real schema is in your authoring guide:

```
// the whole product in one story
navigate  /r/fixture
click     "New issue"          → shot
input     title, body          → shot
click     "Create"             → shot   // issue page, ladder at OPEN
click     "Create branch"      → shot   // ladder at BRANCH
// (push commits via a fixture hook)
click     "Open PR"            → shot   // ladder at PR, diff rendered
click     "Merge · squash"     → shot   // ladder at MERGED, issue auto-closed
navigate  /r/fixture           → shot   // branch gone from the list
```

Then: **repo browse** (tree → blob with highlighting → commit log → single commit), **the README render** (a fixture README exercising every CommonMark construct plus a table, which doubles as a markdown-pipeline regression test), and **the empty states** — a repo with no commits, an issue list with nothing in it, a PR with a conflict. Empty states are where server-rendered apps break and where nobody looks.

Run all of them across your four breakpoints. The layout leans on `clamp()` for the display type and on the compensated small-caps rule for filenames; both are exactly the kind of thing that looks right at desktop and wrong at 375 px.

> **THE FIXTURE REPO HAS TO BE BYTE-REPRODUCIBLE, OR EVERY BASELINE CHURNS**
>
> This is the one setup task that will bite if it's left implicit. **A commit SHA is derived from its content _and_ its author and committer timestamps.** Build the fixture repo in a script and the SHAs change on every run — so every page showing `a1b2c3d` diffs, forever.
>
> Build it once with `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` pinned to fixed values, then **commit the resulting bare repo as a tarball** and have the per-breakpoint fixture hook restore it. Same for the seed rows in Postgres — fixed IDs, fixed timestamps. Deterministic fixture in, deterministic screenshot out.

#### What Tuffgal can't see — four contract tests

These aren't a second test suite so much as four assertions that a screenshot is structurally unable to make:

| Contract         | Assertion                                                                                                   | How                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Weight**       | Page < 100 KB · zero client JS on the critical path                                                         | `size-limit` against the rendered HTML plus assets. A page can double in weight and look identical.                                                                                                |
| **Subprocesses** | < 12 `spawn` calls per render                                                                               | A counter in the git layer, asserted per route. **The most valuable test in the plan** — see below.                                                                                                |
| **Headers**      | Blob origin always returns `sandbox` CSP · never `Set-Cookie` · `javascript:` in markdown renders no anchor | Plain request assertions. Four of them, covering the three vulnerability classes in §11.                                                                                                           |
| **a11y rules**   | Zero axe violations across both render paths · every token reads back non-empty in both                        | `axe-core` — complementary to the a11y tree, not redundant. The tree snapshot catches _structural_ drift; axe catches _rule_ violations like contrast and ARIA misuse, which a tree can't express. Neither sees a vanished token, so that is asserted separately. |

The subprocess counter deserves the emphasis: it's the only test that catches the specific way this codebase will get slow. A well-meaning refactor that renders a file list by calling `cat-file` once per row passes every other check — the screenshots are pixel-identical, the HTML is byte-identical — and quietly turns a 40 ms page into a 400 ms one. Nothing else in the suite would notice.

> **THIS MAKES THE MIRROR CI WORTH HAVING**
>
> Tuffgal's design — **CI is the sole writer of baselines** — pairs exactly with the GitHub Actions plan in §10, and it upgrades that plan's value considerably. Lint and typecheck on the mirror are nice; _visual review as a PR gate_ is a reason to have CI at all. The `tuffgal-action` runs on the mirror, publishes candidates as artifacts, and you approve with `tuffgal approve --from` and commit.
>
> Two things follow. The status endpoint (§07) becomes the natural place for Tuffgal's exit code — **2 (pending baselines) is a distinct state from 1 (failure)**, so don't collapse them into pass/fail; "review needed" is a real state. And Tuffgal is pre-1.0 with an explicitly unstable API, so pin the version.

And your point about terminal browsers generalises further than it looks: semantic tables and lists with no JS means the pages also survive being **piped into an email body, quoted in a chat unfurl, or read by a feed reader**. That's not a side effect of the accessibility work, it _is_ the accessibility work.

## 01 · The shape of it

_What you're building, and why it's tractable_

A single Node process serving three things: a server-rendered web UI, anonymous git-over-HTTPS for reading, and an SSH listener for writing. Postgres holds metadata. Git objects stay on disk and are read by shelling out to plumbing. That's the whole system.

Two things make this a ten-evening project rather than a six-month one.

**First: `git merge-tree --write-tree`** (git 2.38+) performs a real three-way merge — rename detection, directory/file conflicts, recursive ancestor consolidation — in a bare repo with no worktree and no index, and prints the merged tree OID. Combined with `commit-tree` and `update-ref`, your entire server-side merge engine is about fifty lines. Every hobby forge that dies, dies managing temp worktrees on disk. You get to skip that.

**Second: "everything public, no private repos, ever" deletes more work than any other decision in this document.** Read over HTTPS needs no authentication at all. Write is SSH public-key only. There is no password column, no session store, no login form, no password-reset email, no read-authorization check on any route. When you later want an API and a CLI, they authenticate over SSH with the same key — so you never introduce tokens either. Most forges are 40% authorization code. Yours is 0%.

> **THE RISK**
>
> Not technical. It's that this becomes the only home of your code before it has earned that trust — a bad force-push, a disk failure, a bug in your own merge path. The mitigation is in [§10](#mirror) and it is not optional: mirror-push every repo outward from day one.

## 02 · Decisions

_Settled — everything downstream assumes these_

- **Approach:** From scratch — No adopted forge, no comparison. This is the project.
- **Stack:** Node / TypeScript — Reuses the Linklater Compose file, Caddy config, and deploy pipeline.
- **Rendering:** Server-rendered — The app is documents. An SPA buys nothing and costs a second state model.
- **Merge:** Server-side button — Merge commit, squash, or fast-forward. Rebase-merge never.
- **MLP:** Repos · Issues · PRs — Browse, clone, push, file, propose, merge. Releases follow.
- **Visibility:** Public, always — Private repos are off the roadmap entirely, not deferred.
- **Accounts:** Admin-created — No signup route exists. Forever.
- **Credentials:** SSH keys only — No passwords, no sessions, no tokens — including for the API.
- **SSH transport:** Embedded (ssh2) — One container, no sshd wiring. Migration path noted in §03.
- **Comments:** Thread-only — Inline diff comments are roadmap, not MLP.
- **Numbering:** One sequence — Issues and PRs share a per-repo counter. Reasoning below.
- **Assignment:** None — No owners, no assignees. They're just issues and PRs.
- **Labels:** Never — Moved out of "maybe." Epics do the job; labels are noise.
- **Name:** Càrn / carn — Càrn on every visual surface, `carn` everywhere technical. Montréal / montreal-repo.
- **URLs:** /r/ prefix — `/r/:repo`. Kills the namespace collision structurally — no reserved list.
- **Highlighting:** highlight.js — Settled. Alternatives dropped from the doc.
- **Themes:** Both, dark-first — Dark is the default and the one that's designed first.
- **Method:** YAGNI — Nothing gets built before it's wanted. Web comments included.
- **License:** AGPL-3.0-or-later — Server and CLI both. Closes the network loophole plain GPL leaves open.
- **Testing:** Tuffgal stories — Visual regression as the primary suite, plus four contract tests. No unit tests.
- **Write path:** CLI only — The web UI is read-only at MLP; the admin forms in §06 come after it. Comments come over SSH.
- **Rate limiting:** At the edge — Caddy, three tiers, tightest on clone and archive.
- **Layout:** One display rule — List items in the display face; titles on show views. Mockups in §06.

### Why issues and PRs share one number sequence

**Issues and PRs draw from one shared per-repo counter.** The reason is cross-references.

You want `#12` in a commit message or PR body to become a link. With separate sequences, `#12` is ambiguous and you'd need a disambiguating sigil — GitLab uses `#12` for issues and `!12` for merge requests, which nobody remembers. A shared counter makes `#12` resolve to exactly one thing, forever. GitHub does this for the same reason. It also makes the issue→branch→PR flow read naturally: issue #12 produces branch `12-slug` which produces PR #13, and every reference is unambiguous.

Implement it as a `next_number` column on `repos`, incremented in the same transaction that inserts the row. Not `MAX(number)+1`, which races. Retrofitting this after you have data is miserable; it costs nothing now.

### No assignees

That removes a column and a filter UI. But **keep `author_id`**. It's one nullable foreign key, `pr_events` needs an actor anyway for the timeline, and it's the difference between "I can add a collaborator in an afternoon" and "I need a migration first." Just don't render it anywhere while it's only you.

## 03 · What's actually hard

_Verified against git 2.43 in real bare repos_

Four places where a naive implementation produces a bug that costs an evening. Each was tested rather than assumed.

### 1 · The merge engine

The recipe is from the `git-merge-tree` man page, and it works:

```
# resolve to OIDs FIRST — see trap (a)
old=$(git rev-parse refs/heads/main)
src=$(git rev-parse refs/heads/feature)

tree=$(git merge-tree --write-tree -z $old $src)
commit=$(git commit-tree $tree -F msg.txt -p $old -p $src)
git update-ref refs/heads/main $commit $old   # compare-and-swap
```

**(a) Exit code 1 does not mean "conflict."** The man page says it does. It doesn't — an unknown ref also exits 1, with empty stdout. Discriminate on _stdout_: a conflict prints a hex OID on line one, an error prints nothing. Resolving refs with `rev-parse` first makes the case unreachable.

**(b) It writes objects.** Every "can this merge?" preview leaves orphan blobs and trees. On git ≥ 2.50 use `--quiet` for the mergeability check — it exits early and writes almost nothing. Either way you need a scheduled `git gc`, which you want regardless because `receive.autogc` defaults to _on_ and will otherwise stall an unlucky push for minutes on a shared-CPU box.

**(c) Always pass `-z`.** Without it, filenames are shell-quoted per `core.quotePath` and the conflict section is explicitly documented as non-machine-readable. With it you get NUL-delimited records where the stable field is the conflict _type_ (`CONFLICT (contents)`) — parse that, never the human message.

**Squash** is the same call with a single `-p`. Set `GIT_AUTHOR_*` and `GIT_COMMITTER_*` explicitly — a daemon has no gitconfig and `commit-tree` will refuse with "Author identity unknown." Use `-F` for the message, never `-m` with interpolated user text. **Fast-forward** skips the tree entirely: `git merge-base --is-ancestor`, then `update-ref`.

> **THE CONCURRENCY RULE**
>
> The merged tree is only valid against the target head you merged _from_. So: read `old` → merge → commit → `update-ref <ref> <new> <old>`. On exit 128 (CAS mismatch), **re-read and re-merge**. Never retry with the stale tree, and never fall back to the two-argument `update-ref` — that's a silent force-push that discards whatever landed concurrently.

### 2 · Git over SSH — the one real decision, and two silent failures

**The hardcoded key is Phase 0 only.** In Phase 1 keys come from the `ssh_keys` table, and `ssh2` handles any number of users perfectly well — Gitea and GitLab implement the same authenticate-against-a-database pattern, just via OpenSSH's `AuthorizedKeysCommand` instead of an embedded server. Additional users are not degraded by the embedded server.

The two real differences: the port (`:2222` unless you do the swap in [§09](#hosting)), and that you own an SSH server's auth code in-process rather than delegating to OpenSSH. `ssh2` is at 1.17.0, roughly one release a year, single maintainer — bus-factor 1, and acceptable here. The escape hatch is contained: your authorization logic lives in the app either way, so switching to OpenSSH later swaps the front door, not the house.

Two gotchas that produce silent failures rather than errors:

- **Public-key auth is two-phase.** The first callback arrives with `ctx.signature === undefined` — that's the client probing whether the key is acceptable. You must `ctx.accept()` the probe; only the second call carries a signature to verify. Get it wrong and auth either always fails, or accepts unsigned probes.
- **The `env` request object is `{key, val}`**, not `{key, value}`, despite the README. Reading `.value` yields undefined, `GIT_PROTOCOL` never reaches the child, and every clone quietly downgrades to protocol v0 with no error anywhere.

Also: reject `shell`, `pty`, and `subsystem` requests outright. Call `stream.exit(code)` _then_ `stream.end()` or the client hangs. Pipe child stderr to `stream.stderr` — that's how `remote:` messages surface. Persist the host key across restarts.

### 3 · Smart HTTP for anonymous clone

Spawning `git upload-pack --stateless-rpc` is right. Three corrections to the obvious version:

- **`--advertise-refs` does not emit the service header.** `git http-backend` prepends `001e# service=git-upload-pack\n` + `0000`; the raw command doesn't. Omit it and v0 clients die with `fatal: invalid server response`.
- **That header is protocol-v0 only.** Under `Git-Protocol: version=2` the body starts at `000eversion 2\n` with no service line. Branch on the request header, and forward it into `GIT_PROTOCOL` for both the GET and the POST.
- **Gzipped request bodies are not an edge case.** The client compresses the POST body once a repo accumulates refs. Skip the gunzip and it works perfectly on toy repos, then breaks later for no visible reason.

### 4 · Reading repos — process spawn cost is the whole story

Shell out to _plumbing_, not porcelain: `git diff-tree -r -M`, never `git diff` — porcelain honors `diff.external`, textconv, and color config from whatever gitconfig the daemon happens to see. `ls-tree -z --long` for trees, `for-each-ref` for branch lists (one process instead of N), `rev-list --count` for pagination.

Measured: 200 separate `git cat-file` processes took **370 ms**; the same 200 lookups through one long-lived `git cat-file --batch` took **7 ms**. On small repos essentially all the cost is process startup — `rev-parse` costs the same as `log -n 20`. A page doing 5–10 spawns is fine; anything rendering N blobs needs a pooled `--batch` process per repo, recycled after each push.

> **NON-NEGOTIABLE SUBPROCESS HYGIENE**
>
> Always `spawn` with an args array, **never `shell: true`**. Put `--` before every path. Reject refs starting with `-`. Set a hard timeout and kill the child on `req.on('close')`, or abandoned clones pile up `pack-objects` processes until the box OOMs. Cap global concurrency with a semaphore — that, not any git config knob, is your real protection on a shared-CPU VPS.

## 04 · Architecture

_One box, one database, four listeners_

```
              :443                         :22 (or :2222)
                │                                │
           ┌────▼────┐                           │
           │  Caddy  │  TLS, static assets       │
           └────┬────┘                           │
     ┌──────────┼──────────┬──────────┐          │
  /r/:repo   /info/refs   /*.json   raw.*      ssh2
  (web UI)   (smart HTTP)  (read API) (blobs)  (exec → git-*-pack
     │          │          │          │         + CLI commands)
     └──────────┴─────┬────┴──────────┴──────────┘
                      │
             ┌────────▼────────┐
             │  Node / TS app  │
             │  ┌───────────┐  │  spawn(), cat-file pool,
             │  │ git layer │  │  concurrency semaphore
             │  └───────────┘  │
             └───┬─────────┬───┘
                 │         │
         ┌───────▼──┐  ┌───▼──────────────┐
         │ Postgres │  │ /var/lib/carn/   │
         │ metadata │  │ repos/<uuid>.git │
         └──────────┘  └──────────────────┘
```

### Repo storage — path traversal, designed out

Store repos at `/var/lib/carn/repos/<uuid[0:2]>/<uuid>.git`, where the UUID is the primary key. URLs and SSH commands carry the bare repo `name`, which is a _database lookup_ returning a UUID. No user-controlled string ever reaches a filesystem path.

Path traversal is empirically the number-one bug class in real forges — several CVEs across 2025–26, including a CVSS 9.5 arbitrary-write-to-RCE. Note that `filepath.Join`-style joining _resolves_ `..`, it doesn't contain you. Deriving the path from a UUID means the check never has to be right, because the dangerous input never gets there. It also makes rename a single `UPDATE`, which is the fix for push-to-create typos.

### Markdown — strict CommonMark, one deviation

You said stay close to pure markdown and skip GitHub's special-casing. That's achievable precisely:

```
const md = new MarkdownIt('commonmark', { html: false }).enable('table')
```

**markdown-it 15.0.0** is the pick — it's semantically 100% conformant to CommonMark 0.31.2 (the only three spec-suite failures are `<blockquote></blockquote>` whitespace), it's ~4× faster than the remark/unified pipeline, and as of v15 it ships first-party TypeScript types, so `@types/markdown-it` is obsolete.

> **THE TRAP IN THAT ONE LINE**
>
> `new MarkdownIt('commonmark')` sets **`html: true`**. The `'commonmark'` preset is a _spec-conformance_ preset, not a safety preset — CommonMark mandates raw-HTML passthrough, so `md.render('<script>alert(1)</script>')` returns it verbatim. The plain `new MarkdownIt()` default is the safe one. You must pass `{ html: false }` explicitly.

**Tables are the only GFM extension worth enabling**, because there's no CommonMark way to express tabular data and a table degrades to visible garbage. Everything else degrades gracefully: `~~x~~` reads fine literally, `- [ ] todo` renders as `[ ] todo`, and bare autolinks are the extension most likely to _create_ surprises. One thing you were half-right about: **fenced code info strings (````ts`) are core CommonMark**, not GFM — you get `class="language-ts"` with zero configuration.

The GFM spec is frozen at 0.29-gfm dated April 2019, anchored to CommonMark 0.29 while CommonMark is at 0.31.2, and GitHub has since shipped footnotes, alerts, and math outside it. There is no current standard to implement.

### Sanitization — you don't need a sanitizer

With `html: false`, markdown-it's output vocabulary is fixed and small — that _is_ your allowlist, enforced by construction rather than by a filter. Its `validateLink` blocks `javascript:`, `vbscript:`, `file:`, and `data:` (re-permitting `data:image/{gif,png,jpeg,webp}` but deliberately _not_ `svg+xml`), and it runs at every destination — inline links, images, reference definitions, both autolink paths. Entities are decoded before validation, so `java&#115;cript:` is caught. Roughly 55 bypass attempts all failed.

What remains isn't XSS, and an HTML sanitizer wouldn't fix it either — it needs a URL policy:

- **Third-party image loading.** `![x](http://evil.com/t.png)` renders, and every visitor to that README pings `evil.com`. On a public forge this is the thing most likely to actually be abused. Fix with a CSP `img-src` and/or an image proxy. — _CSP half shipped in 1a: `img-src 'self' data:` in `src/app.ts`, pinned as an exact string by `verify-phase-1a.sh`. A README's remote image is blocked and degrades to its alt text; that is the intended behavior, not a rendering bug. The proxy half is deferred past MLP — it is what eventually renders remote images without leaking every visitor's IP to the image host._
- **Unbounded scheme allowlist.** `validateLink` is a blocklist of four, so `blob:`, `about:`, and custom app schemes all pass. Replace it with an allowlist of `https|http|mailto` plus the data-image forms, and reject protocol-relative `//`. — _Shipped in 1d: `allowLink` in `src/markdown/render.ts`._
- **No `rel`.** Add `rel="nofollow ugc"` to external links via a renderer rule override. — _Shipped in 1d: a `link_open` override in `src/markdown/render.ts`. Applies to absolute `http(s)` links only; relative links, anchors, and `mailto:` are untouched, and there is no same-host carve-out._
- **Relative links resolve against the wrong page.** A README's `[docs](docs/BRAND.md)` renders as a link to `/r/:repo/docs/BRAND.md`, which is not a route. `allowLink` passes schemeless destinations through unmodified on purpose — that is ordinary README content, not a hole — but nothing rewrites them to `/r/:repo/blob/:rev/docs/BRAND.md`, which is where they belong. The same applies to **relative images**: `![diagram](docs/arch.png)` is schemeless, so it resolves wrong and renders broken, and rewriting it to the first-party content-addressed asset route makes committed images in READMEs work under `img-src 'self'` with no CSP change. — _1e, which is where `/r/:repo/blob/:rev/*` lands. It needs `renderMarkdown` to take a `{ repo, rev }` context — it is a pure function today with one call site at `src/html/repo-show.ts` — and it needs `test/contract/markdown.contract.ts`, which currently pins the unrewritten behavior as intentional, updated deliberately in the same commit. **Rewrite unconditionally**, without checking the tree: an existence check costs a nested-path lookup per link straight into the 12-spawn budget, makes the same README render differently on different refs, and buys nothing — a 404 on a link to a file that is not there is the correct answer, and better than silently leaving a link pointing somewhere else wrong._

The markdown layer and the response header deliberately disagree about remote images: `allowLink` permits an `https:` image URL that CSP then refuses to load. The parsing layer parses and the header enforces, so the enforcing layer being the stricter one is correct. Do not "fix" the mismatch by widening `img-src` — that undoes the control this section specifies, and fails `verify-phase-1a.sh`.

> **IF YOU EVER DO REACH FOR A SANITIZER**
>
> Use `rehype-sanitize` or `sanitize-html` — both scored zero real leaks in testing. **Do not use DOMPurify with linkedom.** It is widely recommended online as the fast jsdom alternative, and it _silently does nothing_: feature detection fails, `isSupported` is falsy, and `sanitize()` returns its input unchanged with no error. All twelve XSS payloads passed straight through. If you use DOMPurify server-side at all, assert `DOMPurify.isSupported === true` at startup — and budget jsdom's 122 MB RSS and 600 ms init.

### Raw blobs

Serve from a **separate hostname** — this is the load-bearing control, not the headers. GitHub serves everything from `raw.githubusercontent.com` as `text/plain` (verified: even `.html` and `.js` files), with a small image allowlist getting real MIME types:

```
Content-Type: text/plain; charset=utf-8   # except png/jpeg/gif/webp/svg
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'; sandbox
X-Frame-Options: DENY
Cross-Origin-Resource-Policy: same-site
```

SVG is the special case — it's active content that can carry `<script>`. Either serve it as `text/plain` like everything else (safest, but your own README `<img>` tags won't render it) or give it `image/svg+xml` from the separate origin behind that CSP, which is what GitHub does. If you can't get a second hostname, `Content-Disposition: attachment` on everything is the fallback.

**The origin does not exist until Phase 2.** The DNS records are a Phase 2
pre-flight and nothing serves on `gelatinous-cube` yet, so `Show entire file`
and `Open raw` are gated on `CARN_RAW_ORIGIN` in `config.ts`. Unset at MLP, the
blob view simply omits the link; Phase 2 turns both on by setting one variable.
No dead code in between.

**Inline images do not come from that origin.** CSP is `img-src 'self' data:`,
so a second hostname is blocked — and widening `img-src` to admit it would undo
the isolation the origin exists to provide. A small image blob renders
first-party through the content-addressed, immutable route that
`/r/:repo/header/:asset` already established, with the same `committed()` guard
that stops it reading an arbitrary OID. The second origin is for downloading
untrusted content, not for embedding it.

### Syntax highlighting

**highlight.js 11.12.0** — settled. Register only the languages you actually serve (`highlight.js/lib/core` plus explicit `registerLanguage`): 15 ms init, 56 MB resident, ~49k lines/sec, and **class-based output at 111 bytes per line** — measured across 46 files sampled evenly through Linklater's 832-file TypeScript corpus, which gzips to **10.2 B/line, 9.2% of raw**. The class-based part is what makes it right for the tenets — your theme lives in one cached stylesheet rather than being inlined into every blob, which for a 2,000-line file is the difference between ~400 KB of HTML and ~1.1 MB. It also means the two themes share one payload.

Wire it through markdown-it’s `highlight` option, whose return value is inserted verbatim — so return escaped HTML. And **cache highlighted blobs by content hash**: highlighting is pure, so a hash→HTML cache removes the cost entirely on repeat views and keeps you inside the TTFB budget.

### Cross-reference autolinking

You want `#12` in a commit message or body to link, plus commit SHAs. **Do it as a markdown-it core rule, never a post-render regex over the HTML.** The regex approach produced three bugs on one small test input: it linkified inside `<code>` spans, inside fenced blocks, and — the killer — it produced **nested `<a>` tags**, which is invalid HTML that browsers _repair_ by restructuring your DOM.

Working at the token level gives you the exclusions for free: `fence` and `code_block` are block tokens with no children, `code_inline` is its own type you simply skip, and tracking `link_open`/`link_close` depth prevents nesting. You also get to transform the display text — a 40-char SHA rendered as 7 chars — which a string regex can't do cleanly.

> **REGISTER IT BEFORE `TEXT_JOIN`, NOT AT THE END**
>
> markdown-it's core chain ends `… → replacements → smartquotes → text_join`. If you `core.ruler.push()` you run _after_ `text_join`, which merges adjacent text tokens — at which point `\#12` (deliberately escaped) has been flattened into plain text reading `#12`, and you will linkify it anyway. Use `md.core.ruler.before('text_join', 'xref', …)` and the escape survives as a distinct `text_special` token you can skip.

Two smaller ones: require the `@` in a handle mention to be preceded by whitespace or start-of-token, or `user@example.com` becomes a link to `@example`. And pass a resolver through markdown-it's `env` object so `#999999` for a nonexistent issue doesn't become a dead link — that's exactly what `env` is for, and it's typed as of v15.

### Rate limiting

The shape differs from Linklater's because the expensive requests aren't the frequent ones. Two mechanisms, both needed:

- **The semaphore (§03) bounds concurrency** — it stops ten simultaneous clones from OOMing the box.
- **Rate limiting bounds volume** — it stops a crawler making ten thousand cheap requests, or one making a hundred expensive ones in sequence.

Do the coarse limiting **at the edge, in Caddy**, so an abusive request never reaches Node and never forks a git process. That needs `mholt/caddy-ratelimit` via `xcaddy` — it's not in standard builds and the README says plainly "this is not an official repository of the Caddy Web Server organization," but it's written by Caddy's author, it's stable, and it gives you a true sliding window (a ring buffer), which neither Node library does. Three tiers:

| Zone               | Budget    | Why                                                                                                                                                                     |
| ------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages, assets      | ~300/min  | Cheap and cacheable. Generous.                                                                                                                                          |
| `git-upload-pack`  | 10–20/min | Each forks a process and can pack the whole history. Partial-clone flags make individual cost wildly variable, so limit _count_, don't try to price them.               |
| Archive generation | 5/min     | Tightest. Fully CPU-bound, trivially amplified, and the classic crawler trap — a bot walking every tag × every format will pin the box. GitLab uses exactly 5/min here. |

> **TWO DETAILS**
>
> **Key on `{client_ip}`, not `{http.request.remote.host}`** — even though the plugin's own README example uses the latter. On your VPS with Caddy at the edge they're identical, but the moment anything sits in front, `remote.host` silently becomes the proxy's address and your rate limit collapses into one global bucket. Set `trusted_proxies` and use `{client_ip}` so it's correct in both topologies. The Node-side equivalent of this mistake is `app.set('trust proxy', true)`, which lets any client forge `X-Forwarded-For` — use a numeric hop count instead.
>
> **Set `ipv6_prefix 56`, not 64.** A /64 is one LAN, but residential subscribers are typically _delegated_ a /56 or /48 — so a per-/64 limit still leaves an attacker 256+ buckets to rotate through. /56 stops the realistic attack; loosen to /64 only if you get collateral-damage complaints.

Keep a coarse in-app limit as defense in depth on the write paths — `rate-limiter-flexible` (v11, actively maintained, memory backend with no Redis needed) with per-key `blockDuration` so repeat abusers escalate. Note it's a "flexible fixed window," not a true sliding one; that's another argument for doing the real work at the edge. And add failed-auth banning on the SSH listener: N failures from an IP in a window, then a temporary block.

### Git config for the box

The defaults are actively wrong for a small shared-CPU VPS: `pack.windowMemory` is unlimited _per thread_, and `pack.threads` auto-detects CPUs, so peak RAM is two unbounded numbers multiplied together.

```
[pack]
    threads = 1              # RAM multiplies by thread count
    windowMemory = 64m       # default: UNLIMITED, per thread
    deltaCacheSize = 32m     # default: 256 MiB
[core]
    bigFileThreshold = 16m   # skip delta search, stream large blobs
    logAllRefUpdates = true  # OFF by default in bare repos — your only undo
[receive]
    maxInputSize = 100m      # default: no limit at all
    fsckObjects = true       # safe on push: quarantine env
    autogc = false           # default ON; stalls pushes. Cron it instead.
[uploadpack]
    allowFilter = true       # lets clients ask for LESS work
```

### Repo size limits — yes, and this is where not having LFS shows up

Without LFS there's nothing structural stopping a repo growing without bound, and on an 80 GB disk shared with Postgres that matters — not because you'd abuse it, but because _one_ accidental `git add` of a `node_modules` or a video file is permanent. Git never forgets; the only cure is a history rewrite.

Three limits, at three different layers, and only the first two need building:

- **Per-push:** `receive.maxInputSize = 100m`, already in the config above. Bounds a single push, and it's the one that catches the accident at the moment it happens, before the objects are in the store.
- **Per-repo:** a soft warning and a hard block, checked in `post-receive` against `git count-objects -vH`. Something like warn at 500 MB, refuse further pushes at 1 GB. Surface it as `carn repo size` and on the repo settings page so it's never a surprise.
- **Per-file:** `core.bigFileThreshold = 16m` is already set and does half the job — files above it skip delta compression entirely, which removes most of the _CPU_ pain. It does nothing for clone size. If you want a real per-file cap, a `pre-receive` hook walking the pushed objects is the place, but I'd skip it initially: `maxInputSize` catches the same accidents with a tenth of the code.

These are guardrails against accidents, not defenses against attack — you're the only person who can push.

And in the Caddy site block for the git routes: `flush_interval -1` (pack streaming is long-lived and chunked, and Caddy's auto-detection of streaming responses is undocumented — don't rely on it), don't let `encode` re-compress an already-compressed pack, and raise timeouts well above your largest clone.

## 05 · Data model

_Ten tables — the whole MLP plus releases_

Postgres is the source of truth for everything _except_ git objects, which live on disk and are read through plumbing. Never mirror commit data into the database beyond caches you can rebuild.

```
users          id, handle, display_name, email, is_admin, created_at
               -- no password column, ever. SSH keys are the only credential.

ssh_keys       id, user_id, name, public_key, fingerprint,
               created_at, last_used_at
               -- unique on fingerprint. This is your entire auth system.

repos          id (uuid), owner_id, name, description, default_branch,
               next_number, created_at
               -- unique (owner_id, lower(name)); id drives the disk path,
               -- so rename is one UPDATE. No is_public — everything is.

repo_grants    repo_id, user_id, level    -- 'write' | 'admin'
               -- read is implicit for everyone. Absence of a row = read-only.

issues         id, repo_id, number, author_id, title, body,
               parent_id NULL,            -- an issue with children IS an epic
               state, created_at, closed_at

pull_requests  id, repo_id, number, author_id, title, body,
               source_branch, target_branch,
               state,                     -- open | merged | closed
               merge_commit_sha, merge_strategy,
               issue_id NULL,             -- issue → branch → PR
               created_at, merged_at
               -- number comes from the SAME repos.next_number as issues

comments       id, subject_type, subject_id, author_id, body, created_at,
               file_path NULL, line NULL  -- inline review, roadmap
               -- one table for issues and PRs; they're the same thread

events         id, subject_type, subject_id, actor_id, kind,
               payload, created_at
               -- opened | closed | reopened | pushed | merged | referenced
               -- renders timelines, powers the activity feed, is your audit log

releases       id, repo_id, tag_name, target_sha, name, body, created_at
               -- tag IS the release, as you proposed. Tarballs from
               -- `git archive` on demand — never stored.

settings       key, value, updated_at
               -- single-row-per-key placeholder: site title, default branch
               -- name, mirror targets. Viewer prefs go in a cookie instead.
```

### Epics instead of labels

**`issues.parent_id`, self-referential** — an issue with children _is_ an epic. No separate milestones table, no epic type, no migration when you decide something should have been an epic all along. A standalone issue is one with a null parent and no children; promoting it is a single `UPDATE` on its would-be children.

Labels are cut entirely. For one person, an epic plus open/closed carries the weight labels usually carry on a team, where they mostly encode _who should look at this_ — a question you don't have.

### Ownership, admins, and how far to take it

One role — admin — and an admin you add can un-add you. With one amendment, costing a single column rather than a second role:

> **OWNER IS A FACT, ADMIN IS A GRANT**
>
> Keep `repos.owner_id` as the immutable creator, and make the rule: **an admin can grant and revoke any grant except the owner's.** Transferring ownership requires the owner. That's not a second role — `repo_grants` still holds only `write` and `admin` — it's one line in the authorization check.
>
> Not about malice — about the accident. A mis-typed `carn repo grant --revoke` that locks you out of your own repository is recoverable only by editing Postgres by hand. One immutable column removes that.

### Users have almost no footprint

Three parts:

- **Handles: yes, you need them anyway.** Not for URLs — for the SSH key lookup, for the CLI's identity, and for mapping a commit's author email back to a user so the UI can say who did something. That's already in `users.handle`.
- **`/users` and `/u/:handle` pages: no.** With one user they'd be a directory of one. Build them the week a second person needs one, and the `/r/` prefix has already reserved the space.
- **`@mention` autolinking: no.** There's nobody to mention, and no notification for a mention to trigger. `#12` is the autolink that earns its place; drop `@handle` from the cross-reference rule entirely, which also removes the `user@example.com` false-positive gotcha and makes that rule simpler.

### Do issues need PRs? Almost — and that's the interesting bit

A PR needs no issue; plenty of changes are just changes. But an issue's _natural_ resolution is a PR that satisfies it, and that asymmetry is worth making visible rather than leaving implicit in a nullable foreign key.

**Render it as a ladder on the issue page** — a five-step state showing exactly where a piece of work has got to:

```
OPEN ─── BRANCH ─── PR #15 ─── MERGED ─── CLOSED
                 12-conflict-output      2 commits, ready
```

Each step is derived, not stored: the branch exists if a ref matching `<n>-*` is present, the PR exists if a row points back with `issue_id`, merged comes from its state. Nothing new in the schema — it's a read across data you already have, which is why it's cheap.

The payoff is that the ladder _is_ the affordance. At each step the next action is the obvious button: _Create branch_ when there's only an issue, _Open PR_ when the branch has commits, _Merge_ when the PR is clean. That's the "little Jira," and it's a template rather than a feature. The escape hatches stay open — close an issue as wontfix, or fix it in a direct commit to `main` and let the `closes #12` reference do the work; the ladder just shows a shorter path.

### One comments table, one events table

Issues and PRs are the same object with different attachments — a title, a body, a thread, a timeline. Polymorphic `subject_type`/`subject_id` columns keep them one code path in the UI and one query for the activity feed later. The alternative, parallel `issue_comments` and `pr_comments` tables, means writing every rendering and notification path twice.

## 06 · Interface

_Nine views, one design language, no owner in the URL_

The page shapes are specified in the companion study: [**Càrn Layout →**](https://claude.ai/code/artifact/587c7ac1-5712-4927-bb82-8e5a80731f80). The pre-build mockups that study was drawn against are archived at [the original artifact](https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1); the shipped pages have superseded them.

One rule resolves every page: **the display face is worn by whatever the page is about.** On a list that's the items — filenames, repo names, issue titles. On a show page it's the single title. On a create page it's the question. Everything else is mono, small, and quiet.

File rows carry three constants: **directories in `--accent-text` with a trailing slash** (it survives grayscale, and `-text` rather than `--accent` because a filename is bold at 16.8px where the clamp bottoms out and therefore owes 4.5:1), **full-row hit areas** with hover and focus states, and **last-commit subject plus age** in mono with tabular numerals. Sixteen rows, then `Show all N`. Of those three, only the first ships on the file tree today — see `docs/LAYOUT.md` §02, which owns what is built and what 1e still owes.

#### The repo view

```
┌──────────────────────────────────────────────────┐
│ SITE [Repos](/repos)     [Create new repo](/new) │
├──────────────────────────────────────────────────┤
│                                                  │
│ (repo name: visually hidden h1)                  │
│                                                  │
│ file preview                                list │
│ lists                                    sidebar │
│ all in chunky font                       actions │
│                                                  │
│                                                  │
│                                                  │
│                                      attribution │
│                                        copyright │
└──────────────────────────────────────────────────┘
```

### URL structure

**`/prs` and `/prs/:n`.** Consistent between list and item, and it matches what people say out loud.

**No owner segment, and `/r/` in front of the repo.** Dropping the owner follows from admin-created accounts: with a handful of users and globally unique repo names there's nothing for it to disambiguate. Change `repos`' unique constraint from `(owner_id, lower(name))` to `lower(name)`; `owner_id` stays on the row for attribution, it just isn't in the path.

> **WHAT THE PREFIX BUYS**
>
> Repo names would otherwise share a namespace with top-level routes, and with push-to-create a typo is enough to claim one. **`/r/` makes the collision structurally impossible** — no reserved-word list to maintain, no validation rule, no failure mode. It also keeps the top level free and legible: `/` for the index, `/new`, `/settings`, and `/u/:handle` later if collaborators arrive.

**`/r/:repo/commits` for the log, `?ref=main` to scope it, and `/r/:repo/commits/:sha` for a single commit.** Keeping the ref in a query parameter avoids the collision between a branch name and a SHA occupying the same path slot.

#### The nine views

| Route                   | View       | Notes                                                    |
| ----------------------- | ---------- | -------------------------------------------------------- |
| `/`                     | Repo list  | The whole site index. Name, description, created.        |
| `/r/:repo`              | Repo       | File tree + rendered README. The page that sells it.     |
| `/r/:repo/blob/:rev/*`  | Blob       | Highlighted source. Raw link points at the blob origin.  |
| `/r/:repo/commits`      | Log        | `?ref=` to scope. Paginated by SHA cursor, not `--skip`. |
| `/r/:repo/commits/:sha` | Commit     | Diff + cross-refs resolved. Immutable — cache forever.   |
| `/r/:repo/branches`     | Branches   | Each row links to the log scoped to that ref.            |
| `/r/:repo/tags`         | Tags       | Same. A tag gets a page of its own in Phase 5.           |
| `/r/:repo/issues`       | Issue list | Open/closed filter. Epics show children nested.          |
| `/r/:repo/issues/:n`    | Issue      | Body, thread, timeline, "create branch" action.          |
| `/r/:repo/prs`          | PR list    | Same shell as the issue list — same table underneath.    |
| `/r/:repo/prs/:n`       | PR         | Diff, thread, mergeability, merge button.                |

#### Everything else on the wire

The complete surface outside the nine:

| Route                                                  | Kind  | Note                                                                          |
| ------------------------------------------------------ | ----- | ----------------------------------------------------------------------------- |
| `/new` · `/settings` · `/r/:repo/settings`             | Web   | Post-MLP. Admin forms; see the settings split below.                          |
| `/r/:repo/releases` · `/r/:repo/releases/:tag`         | Web   | Phase 5.                                                                      |
| `/r/:repo/header/:asset`                               | Web   | The committed header image, addressed by blob OID. Immutable — cache forever. |
| `/r/:repo/info/refs` · `POST /r/:repo/git-upload-pack` | Git   | Anonymous read only. No `git-receive-pack` over HTTP, ever — push is SSH.     |
| `/r/:repo/archive/:rev.tar.gz`                         | Git   | `git archive` on demand. The tightest rate-limit zone.                        |
| Any view + `.json`                                     | API   | Read API — the same view model, serialized. No separate route tree.           |
| `POST /api/r/:repo/statuses/:sha`                      | API   | The one machine-callable write. GitHub-shaped. See §07.                       |
| `/health`                                              | Ops   | What Caddy health-checks and what the SIGTERM handler flips.                  |
| `/robots.txt` · `/sitemap.xml`                         | Ops   | See below — both matter more here than on a normal site.                      |
| `/r/:repo/commits.atom` and friends                    | Feeds | Atom per repo for commits, releases, and issues, plus a global activity feed. |
| `cube./r/:repo/raw/:rev/*`                             | Blobs | Separate origin. `text/plain` + `sandbox` CSP.                                |
| `cube./`                                               | Blobs | The easter egg. See §12.                                                      |

#### Sitemap and robots.txt

A performance decision, not an SEO one, and it has one rule: **list repo, issue, and PR pages only. Never commits, never blobs, never archives.** A sitemap enumerating every commit page would be an _invitation_ into the most expensive endpoints — a crawler walking every tag × every archive format is the traffic pattern that pins a fair-share CPU.

`robots.txt` is the other half and it's load-bearing: disallow `/r/*/archive/`, `/r/*/commits/`, `/r/*/blob/`, and the blob host entirely. Together with the §04 rate-limit tiers that's three independent layers on the same risk, which is about right given it's the one that can take the box down.

#### Feeds

**Atom**, four of them, all trivial once `events` exists: per-repo commits, per-repo releases, per-repo issues, and a global activity feed. Atom over RSS for RFC-3339 dates, mandatory stable IDs, and real `xml:base` handling. Serve as `application/atom+xml` and put `<link rel="alternate">` in the page head so readers autodiscover.

This is also what removes any need for notifications.

#### Settings are two things

Three, in fact:

- **Site settings** (`settings` table, key/value, admin-only): site title, the _default_ default-branch name for new repos, the reserved-name list, the mirror target _pattern_.
- **Repo settings** (columns on `repos`): description, this repo's actual default branch, its specific mirror remote, archived flag.
- **Viewer preferences** (a cookie): diff view mode, tab width. There's no session to hang these on and no reason to want one — a cookie is the correct storage for a preference that belongs to a browser rather than a person. The palette is not one of them: it follows `prefers-color-scheme` so that every page stays byte-identical for every visitor.

The distinction: _default branch name_ is a site setting because it's a policy for repos that don't exist yet; _default branch_ is a repo setting because it's a fact about one repo. Same for mirrors — the site knows the pattern, the repo knows its remote.

## 07 · API and CLI

_Both of your questions have the same answer_

Both, built on one mechanism — because a conventional version of either would undo the best decision in the plan.

### The problem with a conventional API

A write API needs to authenticate its caller. The normal answer is personal access tokens — which means a tokens table, a generation UI, hashing, scopes, expiry, revocation, and a second credential for you to leak. That is precisely the credential system that "SSH keys only" deleted. Adding it back for the convenience of `curl` would be a bad trade.

### The answer: the CLI speaks SSH

Your SSH listener already authenticates a public key, resolves it to a user, and receives an arbitrary command string in the `exec` request. Today it dispatches two commands: `git-upload-pack` and `git-receive-pack`. There is no reason it can't dispatch more.

```
$ ssh git@carn.fyi issue create linklater "Merge button eats conflicts"
$ ssh git@carn.fyi issue list linklater --open
$ ssh git@carn.fyi pr merge linklater 14 --squash
$ ssh git@carn.fyi repo rename oldname newname
```

Same key, same auth path, same authorization check. **No tokens, ever.** The `carn` binary is then a thin argument-forwarding wrapper over `ssh` — a few hundred lines including help text and output formatting, with the actual command implementations living in the app where they already are. This is how Charm's soft-serve works, and it is the single most elegant consequence of your no-passwords stance.

### The read API is nearly free

Everything is public, so reads need no authentication at all. Content-negotiate the existing SSR routes: `Accept: application/json` — or a `.json` suffix, which is friendlier to `curl` — returns the same view model your template renders, serialized. No separate route tree, no separate contract, no drift between them, and it stays correct for free because it's the same object.

> **ONE THING TO DESIGN DELIBERATELY**
>
> Make the **commit status endpoint** the exception, and shape it like GitHub's: `POST /api/r/:repo/statuses/:sha` taking `state`, `context`, `description`, `target_url`. It's the one write endpoint that genuinely needs to be callable by a machine that has no SSH key — an external CI job. That schema is universally understood, so every future CI backend becomes a drop-in. See [§10](#mirror); it's the seam the whole CI story hangs on.

### Where comments come from

This is the one place the no-credentials stance has a visible consequence, and it's worth stating plainly rather than discovering in Phase 3.

**The web UI has no authenticated visitors, so it cannot accept writes. Comments come from the CLI.**

```
$ carn issue comment linklater 12 "merge-tree exits 1 on unknown refs too"
$ carn issue comment linklater 12 --editor      # opens $EDITOR
```

The identity is the SSH key, resolved to a `users` row, exactly as it is for a push. It's coherent, it's the same code path as everything else, and for long bodies it's arguably _better_ — `--editor` gives you vim or Nova rather than a textarea that loses your draft.

> **THE ESCAPE HATCH, IF IT EVER CHAFES**
>
> If you later want to comment from a phone or a borrowed laptop, the fix does _not_ require introducing a password or a token. Add `carn web-login`: it runs over SSH, mints a short-lived signed cookie value, and prints a one-time URL. Clicking it sets the cookie and the web UI unlocks writes for that browser. The SSH key remains the only real credential — the session is derived from it, not a second thing to leak. Build it when you miss it, not before.

### Packaging the CLI

Shipped on npm. Three constraints shape the naming:

- **npm forbids non-ASCII package names.** `càrn` is rejected — "name can only contain URL-friendly characters," since the name becomes part of a URL. So does any capital letter.
- **`cairn` is taken** (an abandoned React Native styling package, last published 2022), and — more awkwardly — **`cairn-cli` was published in May 2026** and already claims `cairn` as its _binary_ name. The whole `cairn-*` namespace has filled up this year.
- **Unscoped `carn` is rejected at publish time.** The registry returns 404 for it — but npm also runs a server-side similarity guard that only fires on publish, and it refuses `carn` as too close to `yarn`, `cron`, and `acorn`. A 404 means unregistered, not publishable.

So: package **`@nschneble/carn`**, binary **`carn`**. Scoped names skip the similarity check entirely, and the `bin` key is independent of the package name, so the command you type is unaffected. Scoped packages default to _restricted_ — set `publishConfig.access` to `public` in `package.json` rather than remembering `--access public` on every publish.

### One command that earns the CLI on its own

`carn tidy`. Details in [§10](#mirror): after the forge deletes a merged branch, this deletes every local branch whose upstream is gone.

## 08 · The build

_Ordered by dependency, gated on a working artifact_

**Issues come before PRs**, because they build the markdown pipeline, the comment thread, the numbering sequence, and cross-reference autolinking — all of which PRs reuse. And **deployment comes early**, so the ops are learned while the app is still simple.

### Before you start

An hour of errands · none of it code

Everything here blocks something later and is more annoying to do mid-build.

- **Buy the box.** InterServer, 2 slices. Re-check the price on their own page first.
- **Harden it** per the VPS playbook — key-only SSH, UFW, a scoped `deploy` user, 2 GB swap.
- **Add the DNS records:** `carn.fancyenchiladas.net` and `gelatinous-cube.fancyenchiladas.net`, A and AAAA, pointed at the box _before_ Caddy starts — it needs them resolving to complete the ACME challenge, and starting early just burns failed attempts toward a rate limit.
- **Create the GitHub mirror repo** — as a plain new repo, _not_ a fork. A fork's commits never count toward your contribution graph.
- **Generate a dedicated mirror deploy key** (ed25519), add it to the GitHub repo with write access, and keep it out of your laptop's agent.
- **Generate a second personal SSH key and put it somewhere you won't lose** — a hardware token, a printout in a drawer, another machine. Not on the laptop. §11 has the full recovery story.
- **Claim the npm name** `@nschneble/carn` — unscoped `carn` is refused by npm's similarity guard for being too close to `yarn`, `cron`, and `acorn`, which is why the package is scoped and the binary is not. See §07.
- **Create the Càrn repo itself** — on GitHub for now; it migrates to Càrn the day Phase 1 ships, a useful first migration to rehearse.
- **Build the Carn Sans subset** with the compensated small-caps recipe. Half an hour, and it unblocks the stylesheet. A second small-caps family is not an alternative — `docs/BRAND.md` §03 forecloses it in favour of merging `smcp`/`c2sc` into Carn Sans itself.

> **GATE** — `ssh deploy@carn.fancyenchiladas.net` works and both hostnames resolve

### 00 · The spike

One evening · throwaway code · go / no-go

Prove the transport before committing to anything. One file: `ssh2` server on :2222, one hardcoded public key, accept the `exec` request, spawn `git-receive-pack` against a bare repo in `/tmp`. Push to it from your laptop. Then the same for clone.

Separately, spawn `git merge-tree --write-tree` on two divergent branches and confirm a tree OID comes out.

> **GATE** — `git push` to your own daemon succeeds → everything after is a web app

### 01 · Core — repos, keys, browsing

2–3 evenings · the irreducible thing

- `users`, `ssh_keys`, `repos`, `repo_grants`. Seed yourself as admin from a migration.
- SSH listener authenticating against `ssh_keys`, resolving the repo `name` → UUID → disk path.
- Anonymous smart-HTTP read, with the three corrections in §03.
- Repo list, file tree, blob view with highlighting, commit log, single-commit diff, branch and tag lists, rendered README.
- **Push-to-create** — ~10 lines in the SSH path.
- **Rename** — `carn repo rename` or a form. One `UPDATE`, because the disk path is a UUID.

> **GATE** — your dotfiles repo lives here and the page looks good

### 02 · Ship it

One evening · reuses your existing pipeline

- Compose file, Caddy config, the git config block from §04, 2 GB swap at `swappiness=10`.
- CI builds the image on a version tag, deploys over SSH as a scoped `deploy` user — the Linklater pattern.
- **SIGTERM handling** in the Node app: flip `/health` to 503, keep serving, wait ~2s, then close. Plus `stop_grace_period: 60s`. This is 90% of the zero-downtime story for ~20 lines.
- Backups: `pg_dump` _and_ a tar of the repos directory, nightly, offsite. The repos are the irreplaceable half.
- Cron `git gc` across all repos, off-peak.
- The mirror hook from §10, before the box holds anything you'd miss.

> **GATE** — a restore test — restore the dump and tar into a throwaway box, then clone from it

### 03 · Issues

2 evenings · builds half of Phase 4

- Markdown pipeline: markdown-it, the URL allowlist, the raw-blob origin.
- Issues table, epics via `parent_id`, comments, events timeline, open/closed.
- Per-repo numbering via `repos.next_number`, in-transaction.
- Cross-reference autolinking as a core rule registered `before('text_join')`. `closes #12` in a merged PR closes the issue.
- **Create branch from issue** → branch named `12-short-slug`.

> **GATE** — you file, discuss, and close a real issue — and branch from one

### 04 · Pull requests

3–4 evenings · the expensive one

- Open a PR: source and target branch, title, body. Merge-base, then `diff-tree` against it.
- PR page: file-by-file diff, thread (reusing Phase 3's), timeline.
- Mergeability check with `merge-tree --quiet`, cached against the pair of head OIDs so it isn't re-run on every render.
- Merge button: merge commit, **squash**, or fast-forward. CAS loop with re-merge on conflict.
- **Auto-delete the source branch on merge** — §10 covers why this fixes the stale-local-branch problem.
- Auto-close on push when a PR's commits land in its target by other means.

> **GATE** — you merge a real change to a real project through your own UI

### 05 · Releases

1 evening

Tag _is_ release, as you proposed. An annotated tag plus notes plus optional attached artifacts, one table keyed on `tag_name`. Tarballs from `git archive` on demand rather than stored.

### 06 · The CLI

1–2 evenings · pure upside

The `carn` binary from §07, wrapping `ssh`. Start with `issue create`, `issue comment`, `issue list`, `pr list`, `pr merge`, `repo rename`, and `tidy`. Everything else accretes.

Since the web UI is read-only, `issue comment` _is_ how you comment — so a minimal CLI belongs in Phase 3 rather than here.

**Roughly 11–14 focused evenings**, live on the internet after four or five. Deliberately front-loaded: you push to your own server on night one, and it's deployed before it's finished.

## 09 · Hosting and deploys

_The VPS playbook, applied — plus two questions answered_

**A second InterServer VPS at 2 slices — 4 GB, 80 GB, ~$6/month.** The reason is CPU, not RAM: InterServer allocates roughly one core per two slices on a fair-share basis, and `pack-objects` during a clone is exactly the spiky single-core workload fair-share scheduling handles worst. Co-locating means a clone makes Linklater visibly slow. It also buys independent blast radius, which matters when you're redeploying constantly during the build.

| Component               | Steady state      | Note                                                     |
| ----------------------- | ----------------- | -------------------------------------------------------- |
| OS (minimal Debian)     | ~150 MB           |                                                          |
| Docker + containerd     | ~150 MB           |                                                          |
| Postgres                | ~350 MB           | Metadata only — small                                    |
| Node app + SSH listener | ~400 MB           | Cap heap at 768 MB                                       |
| Caddy                   | ~30 MB            |                                                          |
| `git` subprocesses      | burst, 100–400 MB | **The new variable** — bounded by §04 config + semaphore |
| Page cache              | ~2.5 GB           | Comfortable                                              |

4 GB is the tier — the one workload where the playbook's "2 GB is genuinely enough" doesn't hold, because git's memory use is bursty and hard to bound. Re-check the price on InterServer's own page before buying.

### Deploys

No blue-green. About twenty lines gets ~90% of the benefit:

- **A SIGTERM handler:** flip `/health` to 503, keep serving real traffic, wait past `health_interval × health_fails`, then `server.close()` and let in-flight requests finish.
- **`stop_grace_period: 60s`** in Compose — the default is 10, which will SIGKILL a long clone.
- **`docker compose up -d --wait`** with a real `healthcheck:` on the app service.
- **`lb_try_duration 30s`** in Caddy, which converts the restart gap from errors into slow requests. Users see a spinner, not a 502.

Realistic gap: about three seconds, _held_ rather than failed. Nothing short of true blue-green saves a clone already streaming a packfile — and that clone is yours, seconds before you pressed deploy.

### Migrations

Two rules, both non-negotiable. **Never drop or rename a column in the same deploy as the code change.** And **always `SET lock_timeout`** — otherwise a migration queues behind a long git operation, takes an `ACCESS EXCLUSIVE` lock, and blocks everything. That's the most common way a "zero-downtime" deploy causes a total outage.

Enforce it with **`squawk`** (v2.62), a Postgres migration linter with 41 rules covering the whole `strong_migrations` surface. The ORMs are no help here — Prisma, Drizzle, Kysely, TypeORM, and node-pg-migrate are runners with no safety analysis. Squawk lints `.sql`, which is what Prisma and Drizzle Kit generate: point it at `migrations/*/migration.sql` in CI, pin `--pg-version` to the server, commit a `.squawk.toml`, and add the pre-commit hook for local feedback.

Rules on from day one: `require-concurrent-index-creation`, `constraint-missing-not-valid`, `adding-not-nullable-field`, `renaming-column`, `changing-column-type`, `require-lock-timeout`, `prefer-timestamptz`.

Two notes, since the folklore has drifted: **adding a column with a constant default has been safe since Postgres 11** — only a _volatile_ default (`gen_random_uuid()`) still rewrites the table. And **non-concurrent index creation has never improved and never will**; setting `NOT NULL` on an existing column still scans every row unless you add a `NOT VALID` check constraint, validate it separately, then set the flag.

Keep `eugene` for the one frightening migration a year — its `trace` mode executes the migration against a scratch database and reports the locks genuinely taken.

### The port swap

Admin SSH moves to :2222 and git takes :22, so the clone URL is `git@carn.fancyenchiladas.net:linklater` with no port and no `~/.ssh/config` entry for anyone cloning. Note that a high admin port is _not_ a security improvement — it reduces bot log noise, nothing more. Do it in Phase 2, in this order, and there is no window where you're locked out:

1. Add `Port 2222` to `sshd_config` _alongside_ `Port 22`. Reload. Both now listen.
2. `ufw allow 2222/tcp`. Open a **second terminal** and confirm login on 2222 _before touching anything else_. Keep the first session open.
3. Update the CI deploy job's port and run one deploy to prove it.
4. Remove `Port 22` from `sshd_config`, reload, verify 2222 still works.
5. Now bind the forge's `ssh2` listener to :22 and open it in UFW.

## 10 · Mirroring, CI, and stale branches

_Three questions with one shared mechanism_

### Mirroring — a post-receive hook to GitHub

Settled: push-only, GitHub only. Codeberg is dropped — you haven't used it, and it turns out to have disabled new pull mirrors anyway, so it offered nothing GitHub doesn't.

Four verified gotchas, of which the second is the one that gets people:

```
#!/bin/sh
# hooks/post-receive
REPO_DIR=$(git rev-parse --absolute-git-dir)   # MUST be before unset
{
  unset GIT_DIR GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY \
        GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_INDEX_FILE
  export GIT_DIR="$REPO_DIR"
  export GIT_SSH_COMMAND='ssh -i /run/secrets/mirror_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes'
  flock -w 120 "/run/mirror-$(basename "$REPO_DIR").lock" \
    git push --prune --quiet github \
        '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*' \
    || logger -t git-mirror "mirror push FAILED: $REPO_DIR"
} >/dev/null 2>&1 </dev/null &    # all three fds — see below
```

1. **The hook blocks the pusher.** A hook that sleeps 5s makes your `git push` take 5s.
2. **`&` alone does _not_ make it async.** Measured: `( sleep 5 ) &` still blocked for the full 5 seconds. The child inherits stdout and stderr, which _are_ the pipe back to your terminal, and git waits for EOF on it. You must redirect **all three** file descriptors. This is the finding that surprises everyone.
3. **`GIT_DIR` is set, and it's relative** (literally `.`). Capture the absolute path first or any `cd` breaks the hook with a baffling "does not appear to be a git repository."
4. **Use explicit refspecs, not `--mirror`.** Verified: `--mirror` pushes everything under `refs/` — including `refs/pull/*` and any internal refs your forge keeps. It also force-pushes and deletes. Explicit `+refs/heads/*` and `+refs/tags/*` plus `--prune` gives you the same sync with none of the leakage.

Better still: have the hook drop a marker in a spool directory and let a systemd timer drain it every minute. Idempotent, survives reboots, retries for free, one place to alert from — and it becomes the trigger point for CI below.

The spool doubles as the CI trigger below, which is the reason to build it that way rather than pushing inline.

### CI — a four-stage progression, and the seam that matters

Since the repos already mirror, the mirror _is_ the CI host.

|       | Stage                                                                          | Cost       | What it gets you                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now   | Client-side `pre-push` hook running lint, typecheck, and `tuffgal run --local` | 30 min     | ~95% of the value, and the only stage with _instant_ feedback. Local mode is advisory and self-diffs against a gitignored cache, so it never touches committed baselines. |
| Next  | GitHub Actions on the mirror — lint, typecheck, and `tuffgal-action`           | A weekend  | Zero new infrastructure on your VPS, and this is where Tuffgal earns its keep: CI is the sole writer of baselines, so visual review becomes a real PR gate.               |
| Then  | Report status back to your forge                                               | 1 evening  | **The architectural step.** A final `if: always()` step curls your commit-status endpoint (§07).                                                                          |
| Later | `forgejo-runner exec` on your own box                                          | 2 evenings | Runs GitHub-Actions-compatible YAML with _no forge at all_ — you invoke it, read the exit code. Same YAML, so both paths coexist.                                         |

Two things worth knowing before you build on this. **Mirror pushes do trigger GitHub Actions** — the famous "pushes with a token don't trigger workflows" restriction is scoped to pushes made _from inside an Actions run_ using the automatic `GITHUB_TOKEN`, to prevent recursion. A push from your VPS with a deploy key is an ordinary external push. Confirm it empirically in five minutes before you rely on it.

> **NOT COUPLED TO GITHUB**
>
> The direction of the dependency does the work: **Càrn never calls GitHub. GitHub calls Càrn.** A workflow's last step POSTs to your status endpoint; càrn has no idea what produced it and no code path that reaches out. If GitHub vanished tomorrow you'd lose _a producer of statuses_, not a function — every page still renders, every merge still works, the commit page just shows no status.
>
> So build the status endpoint at stage 3 and shape it like GitHub's commit statuses (`state`, `context`, `description`, `target_url`). That schema is the seam. The local `forgejo-runner exec` path at stage 4 posts to the identical endpoint, which means "real CI" is a swap of the producer, not a rewrite — and the two can run side by side while you're deciding.
>
> Stage 2 is **CI-lite, deliberately** — twenty lines of YAML on infrastructure that already exists, green/red today, designed from the start to be thrown away.

On the tempting shortcut — a `post-receive` hook running a container directly: it's viable, but be clear-eyed. CI by definition runs code from the repo; `npm ci` executes lifecycle scripts. While you're the only pusher that's exactly as dangerous as running `npm test` on your laptop, i.e. fine. The moment anyone else can push, or you build a PR branch, it's remote code execution on your VPS. If you do it: `--memory=1g --cpus=1 --pids-limit=512`, a hard `timeout`, `flock` to one job at a time, build the exact pushed SHA via `git archive`, and **never bind-mount the Docker socket** — that's trivially root on the host and the single most common self-hosted-CI compromise.

### The GitHub Actions format, not the runner

**Adopt the workflow format.** That brings `actions/checkout`, `actions/setup-node`, `actions/cache` and your own `tuffgal-action` working unchanged, and — the part that matters most day to day — **one workflow file instead of two.** Without this, every repo carries a `.github/workflows/ci.yml` for the mirror and a `.carn/ci.yml` for home, and they drift the first week. Forgejo made the same bet.

**Do not implement the runner.** Full fidelity means `${{ }}` expression evaluation, contexts, matrix expansion, service containers, and a spec someone else keeps extending. Delegate it. `forgejo-runner exec` is a maintained soft-fork of `act`, already speaks the format, and runs a workflow _with no forge at all_. Càrn's job is to store the workflow, queue a job, shell out, and read an exit code. It never parses an expression.

> **OWN THE QUEUE, NOT THE PROTOCOL**
>
> `forgejo-runner` in _daemon_ mode expects a Forgejo-compatible API — registration, job polling, log streaming. That's a protocol to implement, not a config to write, and it buys you remote runners and parallelism you don't need. **Skip the daemon.** Càrn owns a job table in Postgres and invokes `forgejo-runner exec` as a subprocess, the same way it already invokes `git`. Same semaphore, same timeouts, same kill-on-disconnect discipline from §03.

Read `.carn/workflows/` first, fall back to `.github/workflows/` — the same fallback Forgejo uses.

### Tuffgal, native

**Càrn's read-only web UI and CLI-first write path fit Tuffgal's review flow better than GitHub's own primitives do.**

`tuffgal-action` already implements the entire review experience: a sticky PR comment with side-by-side thumbnails, checkbox approval, an `@tuffgal approve` command, artifact upload, a per-PR Pages preview, and a bot that pushes baselines back to the branch. Càrn has none of those primitives, and adding them literally would mean a bot identity, web writes, artifact storage, static hosting, and interactive checkboxes — four of which contradict settled decisions and the fifth violates "no client JS."

But every one of those primitives has a Càrn-shaped substitute that already exists:

| What Tuffgal needs       | On GitHub                                | On Càrn                                                                                                                                                       | New work        |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Publish the report       | Artifact + `gh-pages` branch             | Push it to `refs/carn/reports/<sha>`. It's static HTML and PNGs — **that's a git tree**, served from the blob origin you already built.                       | none            |
| Show diffs in review     | Sticky bot comment with thumbnails       | The PR page renders a before/after/diff triptych from the status payload. Read-only, no bot, no comment.                                                      | ~50 lines       |
| Approve baselines        | Checkbox, `@tuffgal approve`, bot pushes | `carn tuffgal approve <repo> <n>` — fetches candidates, runs `tuffgal approve --from`, commits, pushes. Authenticated by the same SSH key as everything else. | one CLI verb    |
| Report the outcome       | Check run + job status                   | The commit status endpoint from §07, with `action_required` as a first-class state.                                                                           | already planned |
| Skip on approval commits | Short-circuit detection                  | Identical logic, nothing forge-specific about it.                                                                                                             | none            |

**Zero new architectural primitives.** The report is a git tree; the approval is a push; the review is a page. Each substitution is _more_ in keeping with tenet 1 than the thing it replaces — a baseline set living in refs is inspectable with plain `git`, which an S3 artifact never is.

> **FIRST-CLASS BY CONVENTION, NOT BY COUPLING**
>
> **Not automatic for all repos.** A CLI tool, a dotfiles repo, or a Rust library gets nothing from visual regression, and auto-enabling means every one carries a no-op or failing check. Detect it instead: a repo has visual checks when it has a `tuffgal.config.ts`, which costs you nothing since you're already reading the tree.
>
> And no hardcoding. The status API is rich enough that Tuffgal slots in with _no Tuffgal-specific code in Càrn_ — a status carries a state, a payload, and optionally an image triptych, a shape any visual tool could emit. Tuffgal is first-class as the reference integration, not as a special case.

Two practical notes. `tuffgal-action` is a **composite** action — shell plus Node, no Docker image, no hosted-runner magic — so `forgejo-runner exec` handles it with only `actions/upload-artifact` needing a substitute, and that's exactly the step Càrn replaces with a report ref. And a Postgres `services:` block is the shakiest part under `act`-family runners; a plain `docker run` in a setup step is less elegant and more likely to work.

The sequencing, then — nothing here before the MLP ships, and each step useful alone: **status endpoint → workflow storage + `forgejo-runner exec` → report refs → image triptych on the PR page → `carn tuffgal approve`.** Tuffgal lands at step four and has everything it needs by step five.

The loop closes: Càrn's own repo is tested by Tuffgal, running on Càrn's CI, built to run Tuffgal.

### Stale local branches after a squash merge

**Why it happens:** after a squash merge, the source branch's commits aren't ancestors of the target — one new commit carries the combined diff. So `git branch --merged` doesn't list it, and `git branch -d` refuses with "not fully merged."

Two things worth knowing before reaching for the obvious tools:

- **`git cherry` does not detect squash merges.** Verified — it reported all three squashed commits as unapplied. It compares patch-ids of individual commits, and the squash produced one commit whose patch-id matches none of them.
- **`git diff target...source` is the wrong dot count.** Three-dot means `merge-base..source` — "what the branch changed" — which is non-empty for any branch with commits. Two-dot works immediately after the squash but breaks the moment `main` moves on.

**The server-side fix is the one that matters: auto-delete the source branch on merge** (Phase 4). That converts a hard content question into a trivial one — the branch is gone, so the client just needs to notice.

**The client-side half** is two settings and a command. Set `git config --global fetch.prune true` (but _not_ `fetch.pruneTags`, which deletes local tags and reliably surprises people). Then:

```
# verified output: prints "feature2", then "Deleted branch feature2"
git fetch --prune
git for-each-ref --format '%(if:equals=[gone])%(upstream:track)%(then)%(refname:short)%(end)' \
    refs/heads | grep . | xargs -r git branch -D
```

That's `carn tidy`. Wrap it with a protected-branch guard and a dry-run default. Note the literal token is `[gone]` with brackets, and that an in-sync branch prints _empty_ — not `ok` — so naive field-splitting misreads it.

For the rarer case of a branch whose remote wasn't deleted, there _is_ a robust deletion-independent test: synthesize the squash commit and then use `git cherry` on it.

```
git cherry main "$(git commit-tree "$(git rev-parse feature^{tree})" \
                     -p "$(git merge-base main feature)" -m _)"
# → "- 410cc78 _"   the leading '-' means already applied upstream
```

Verified correct both immediately after a squash and after `main` moved on with unrelated commits. Build a throwaway commit whose tree is the feature tip and whose parent is the merge-base; its patch-id is exactly the squashed diff.

## 11 · Risks

_Ranked by what actually costs you something_

|          | Risk                                                                                                                               | Mitigation                                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | **It becomes the only home of your code before it's trustworthy.** A bad force-push, a disk failure, a bug in your own merge path. | The §10 mirror, in **Phase 2** — before the box holds anything you'd miss. Plus `core.logAllRefUpdates = true`: reflogs are _off by default in bare repos_ and are your only undo after a bad force-push.      |
| Critical | **You lose the laptop.** One SSH key is the only credential for the only forge holding all your code.                              | See below — this needs a paragraph, not a cell.                                                                                                                                                                |
| High     | Subprocess resource exhaustion — abandoned clones piling up `pack-objects`, or one big clone pinning the shared core.              | Global semaphore, hard timeouts, kill-on-disconnect, plus the §04 config. Git's memory knobs bound one process; nothing but a semaphore bounds ten.                                                            |
| Medium   | Content-injection through rendered markdown or a committed `.html`/`.svg` blob.                                                    | Largely designed out by `html: false` (§04). The residue is a URL policy, not a sanitizer: scheme allowlist, `rel="nofollow ugc"`, CSP `img-src`, and blobs on a separate origin.                              |
| Medium   | You build 70% and stall — the classic fate of a side project with no external forcing function.                                    | The phase gates exist for this. Phase 0 is one evening to "I pushed to my own server," Phase 2 puts it on the internet, and if Phase 4 stalls you still have a repo browser with issues that you'd keep using. |
| Medium   | `ssh2` is bus-factor 1 at roughly one release a year.                                                                              | Fine for personal use. The escape hatch is OpenSSH with `AuthorizedKeysCommand` — a contained change, since authorization already lives in your app.                                                           |
| Low      | Path traversal via repo or ref names.                                                                                              | Designed out by UUID-derived paths. Still reject refs beginning with `-` and always pass `--`.                                                                                                                 |
| Low      | Scope creep back toward re-implementing GitHub.                                                                                    | §13 makes each addition a decision rather than a drift. The "never" column is load-bearing.                                                                                                                    |

### Losing the key — the answer is more of the same mechanism

No new mechanism is needed. Three layers, in order of how often you'd reach for them:

- **Register more than one key.** `ssh_keys` is already one-to-many. Add a second keypair that never travels — on a hardware token in a drawer, on the desktop, or printed and folded into a safe. Lose the laptop, delete its row from the surviving machine, done. **The recovery credential is the same kind of thing as the primary one** — no second code path, no shared secret, nothing new to implement.
- **Use a hardware-backed key for the laptop:** `ssh-keygen -t ed25519-sk`. The private key material lives on the FIDO2 token, not the disk — so a stolen laptop is an inconvenience rather than a compromise, and you can be unhurried about revoking.
- **The VPS is the root of trust**, and that's the bottom of the stack. You own the box; InterServer gives you console access. The break-glass is `docker compose exec app carn admin key add` — an admin verb that runs _locally on the host_ and needs no SSH into Càrn, only shell on the machine.

> **WRITE THE BREAK-GLASS PROCEDURE DOWN IN PHASE 1, WHILE YOU STILL REMEMBER THE SCHEMA**
>
> Four lines in the repo's README: how to reach the console, how to exec into the container, the exact command, how to verify. Recovery is always possible — you own the hardware. The failure mode is reverse-engineering your own `ssh_keys` table from memory at 11pm.

**Revocation is instant.** Every SSH connection re-reads the key table, so deleting a row is sufficient — no cached authorization, no session to expire. Don't optimize that away with a key cache later.

## 12 · Naming

_Three registers, one rule_

**Càrn** on every visual surface. **Carn** in ASCII prose, where it's still a proper noun but the accent can't render. **`carn`** for every identifier a machine parses — hostname, npm package, binary, database, containers. The Montréal rule: the accent lives wherever it can and drops wherever a machine has to type it.

> **WHY THE HOSTNAME CAN'T CARRY THE ACCENT**
>
> `càrn.fancyenchiladas.net` punycodes to `xn--crn-9ka.fancyenchiladas.net`. Browsers handle that transparently and would display the pretty form. **OpenSSH does not.** I grepped the current OpenSSH source: there is not a single occurrence of `idn`, `idna`, `punycode`, or `xn--` anywhere in the connection path. It passes your raw UTF-8 bytes straight to `getaddrinfo()` with only `AI_CANONNAME` set — never `AI_IDN`, which is opt-in on glibc and doesn't exist at all on macOS. So `git clone git@càrn.fancyenchiladas.net:linklater` simply fails on your MacBook, and the copy-paste clone URL on every repo page would be broken.
>
> Two more, while we're here. **Caddy doesn't accept Unicode site addresses either** — and it fails _silently_, serving a 200 with an empty body rather than a config error (issues #6404 and #6673). You'd have to write the punycode in the Caddyfile regardless. And Let's Encrypt requires the A-label form on the order. Meanwhile macOS hands back NFD-normalized strings, so `à` can arrive as two codepoints and punycode to `xn--carn-rvc` — a completely different label from the NFC form. That's a permanent low-grade footgun in your own host-matching code.

If the accented form should resolve too, register the IDN and 301 it to the ASCII host over HTTPS. Browsers are the only surface where IDN works end to end, so that redirect is as far as it should go.

**An Càrn Gorm** is "the blue cairn" — Cairngorm's own root. (Trivia: the Gaelic name for the _range_ isn't a plural of that at all — it's _Am Monadh Ruadh_, "the red mountains." English named the whole range after one blue peak.)

### Càrn

_KAARN · masculine · cairn, heap of stones — also a verb: to heap, pile up, accumulate_

Masculine noun, genitive and plural _cùirn_. A heap that _many passers-by each add one stone to_, and which _marks a route for those who follow_ — a commit history and a public repo in one image. It doubles as a verb: to heap, pile up, accumulate.

`Càrn · carn.fancyenchiladas.net · npm: @nschneble/carn`

### Where each spelling goes

| Surface                                   | Form     | Why                                                                                                                              |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Page titles, nav, footer, README, docs    | **Càrn** | The real word. Nothing here is parsed by a machine.                                                                              |
| Hostname, clone URLs, TLS cert, Caddyfile | `carn.`  | OpenSSH can't resolve IDN; Caddy fails silently on Unicode addresses.                                                            |
| npm package                               | `@nschneble/carn` | npm forbids non-ASCII names outright, and unscoped `carn` is refused by the similarity guard (`yarn`, `cron`, `acorn`). |
| Binary on `$PATH`                         | `carn`   | A scope is a registry namespace, not a command name. `cairn` and `cairn-cli` are both taken; the latter already claims the `cairn` binary name. |
| Repo, database, container names           | `carn`   | Anywhere a shell or a config file has to type it.                                                                                |

Grave accents in Gaelic are meaning-bearing, not decorative — `obair` is "work," `òbair` is "retch." Only grave accents exist in modern Gaelic; acutes are pre-1981 and appear only in older dictionaries.

### The blob host

**`gelatinous-cube.fancyenchiladas.net`.** A gelatinous cube is a dungeon monster that _engulfs objects into itself, where they remain suspended and visible while it slowly digests them_. That is a blob store. It is also, specifically, an _opaque container that isolates whatever it has swallowed from everything around it_, which is the exact security property the second origin exists to provide.

Length costs nothing — nobody types this host, it only appears in generated `href`s.

> **THE EASTER EGG AT `/`**
>
> Safe, and for a stronger reason than it looks. Under `Content-Security-Policy: default-src 'none'; sandbox`, **every blob response lands in its own unique opaque origin** — not the host origin, and not even the same origin as any other blob. So a first-party page at `/` shares an origin with nothing. This is a better posture than the classic sandbox-domain setup, where user content can attack other user content on the same host.
>
> Three conditions. **Never set a cookie on that origin** — and check that no app cookie is scoped to `.fancyenchiladas.net` with a leading dot, or the blob host receives it; use exact-host scoping and the `__Host-` prefix. **Keep the page static and self-contained** — no query-param reflection, no JS reading `location`. And **make the blob branch the default and the easter egg an exact-match exception on `/`**, never a prefix. The risk isn't the page — it's introducing conditional header logic on an origin whose whole model was one unconditional strict policy. A future refactor letting a blob path fall through to the page branch would serve untrusted content without `sandbox`. Assert the CSP on a representative blob path in the contract tests.

## 13 · Roadmap

_After the MLP — each an explicit decision, not a drift_

#### Yes — queued

- Full-text search over issues and PRs — Postgres `tsvector`, not Elasticsearch
- Activity feed, per repo and global — the `events` table already carries it
- Branch protection on `main`
- CI, via the §10 progression
- Outgoing webhooks
- `carn export` — issues out as markdown
- **Wikis** — a repo of markdown, an evening's work
- A landing page and an FAQ — see below
- **GitHub Actions workflow format**, executed by `forgejo-runner exec`
- **Native Tuffgal** — report refs, image triptych, `carn tuffgal approve`

#### Maybe

- Inline diff comments
- Web writes via `carn web-login`
- Real small caps merged into Carn Sans (`smcp`/`c2sc`)

#### Never

- Private repos
- Open signups
- Passwords or tokens
- Labels
- Git LFS
- Package registry
- A GitHub Actions _runner_
- Bot users
- Federation
- Email patch workflow
- Mercurial
- Orgs and teams
- Rebase-merge
- An SPA rewrite

### Inline diff comments

They earn their place at work, where you're reviewing someone else's unfamiliar code and need to point at line 47. On a personal forge you're reviewing your own change from an hour ago, and a thread is enough.

The cost is also higher than it looks. Anchoring a comment to a line means storing the blob SHA plus the line number and then deciding what happens when the branch is force-pushed and that line no longer exists — GitHub's "outdated" state exists because there's no good answer. The columns sit in `comments` if that changes; leave them empty.

### Cross-repo PRs

Not useful as designed, and the reason is a genuine tension rather than a technicality.

> **"PUBLIC AND OPEN SOURCE" + "ADMIN-CREATED ACCOUNTS ONLY" = READ-ONLY OPEN SOURCE**
>
> Anyone can read every repo, clone it, and fork it elsewhere. **Nobody can contribute back** — there's no signup, so there's no account, so there's no branch to open a PR from. That's the right position for a personal forge, but it means "open source by default" describes the _license_ and the _visibility_, not the _participation_.
>
> Three answers exist without changing the model: add them as a user, take a patch by email and `git am` it, or accept a pull request on the GitHub mirror. The third is the best — the mirror already exists for CI, and it makes GitHub the contribution front door while Càrn stays the canonical home.

Forks within Càrn only matter if it grows several users who don't trust each other, which is explicitly not the plan.

### Git LFS

Git stores every version of every file forever, and every clone gets the whole history. One 200 MB binary revised thirty times is ~6 GB in every clone, permanently — and git's delta compression is near-useless on binaries. LFS keeps those files out of the object database: a `clean` filter hashes the real content, stashes the blob, and commits a ~130-byte pointer file instead; a `smudge` filter fetches the blob on checkout. Git only ever sees the pointer.

Server side you'd implement the LFS **Batch API** — one endpoint (`POST /:repo.git/info/lfs/objects/batch`) that takes a list of `{oid, size}` and returns signed upload/download URLs. The endpoint itself is a day or two; the cost is everything around it — auth on those URLs, quota accounting, and garbage-collecting unreferenced OIDs, which requires walking history because nothing tells you when an OID stops being referenced.

**Never, for source code.** LFS pays for itself on game art, PSDs, datasets, and model weights. Text deltas beautifully and is exactly what git was built for. Adding it buys a new failure mode — clone succeeds, files are 130-byte pointers, because the visitor lacks `git-lfs` — in exchange for nothing. The one thing that would force it is migrating in a repo that _already_ contains LFS pointers, which is an interop obligation rather than a feature.

### The landing page is the "never" list

**The constraints _are_ the positioning.** Every forge's marketing page is a feature grid; this one is a list of things it refuses to do.

It also does real work beyond tone. Someone landing on a repo needs to know within about four seconds that there is no sign-up button and why — otherwise the absence reads as an unfinished site rather than a position.

Pair it with an FAQ that has exactly one job: **tell a would-be contributor what to actually do.** "Can I contribute?" → fork the GitHub mirror and open a PR there; it's the inbox, càrn is the record. That page turns the constraint from exclusionary into merely unusual.

Punk lands when it's _specific_. "No private repos, ever" is punk. "No sign-ups, no tokens, no passwords, no tracking, no JavaScript" is punk. Naming a rival is a competitor slide, and it ages badly on a page still running in three years.

### Cloning and forking

**Anyone can clone, and anyone can fork.** Clone is anonymous over HTTPS with no account. "Fork" in the git sense is just `clone` plus `push` to somewhere else — a mirror on GitHub, their own forge, a hard drive. None of that needs a feature from you, and none of it can be taken away, which is the strongest guarantee an open-source host can offer.

What you don't have is _forking into càrn_, and that's the deliberate part. The two paths that stay open for real participation: add someone as a collaborator (one CLI command, and you were always going to vet them), or take their PR on the GitHub mirror. One wrinkle on that second path worth documenting in the FAQ — **you can't merge it on GitHub**, because the mirror force-pushes and your next push would overwrite it. The flow is `gh pr checkout <n>`, push the branch into càrn, review and merge there; their GitHub PR closes on its own when the commits land downstream.

### Wikis and package registries — opposite answers

**Wikis are cheap.** A wiki is a git repo full of markdown, rendered, and you will already have: bare repo creation, SSH push, markdown rendering, cross-reference autolinking, and a file browser. A wiki is a repo named `<repo>.wiki`, a route that renders its markdown instead of listing its files, and roughly nothing else — call it an evening. It's also the most tenet-1 feature on the list — literally just git, editable with a normal editor and normal commits.

**Package registries are a whole second product.** There's no such thing as "a registry" — there's an npm registry, an OCI registry, a PyPI registry, a Maven registry, each with its own protocol, auth model, and storage semantics. Forgejo supports twenty-plus ecosystems and that's a large fraction of its codebase. Meanwhile npm and GHCR work fine and cost nothing.

### Labels

Never. They mostly encode _who should look at this_ and _what kind of work is this_ — the first question doesn't exist here, and epics answer the second better. One less table, one less filter UI.

### Webhooks — what they're actually for

For a single-user forge: **almost nothing, until CI exists.** Then they become the thing that triggers it, and the general-purpose escape hatch for everything you haven't thought of — a deploy trigger, a static-site rebuild, a notification. Cheap to add — a table of URLs, a signed POST, a retry — and the difference between "I'd have to modify Càrn" and "I'd write a 20-line receiver." After the status endpoint, not before.

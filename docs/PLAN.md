<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/bd38dee8-6822-4b2c-a602-bde753e498a3
     is generated from this Markdown by `scripts/docs-artifact.mjs`. Edit
     here and run the script to update the build artifacts. -->

**IMPLEMENTATION PLAN**

# Build your own forge

**Càrn is a self-hosted git forge.** Repos, issues, and pull requests. Server-rendered HTML, public by default, no passwords.

## 00 · The three tenets

The foundational aspects that differentiate Càrn from GitHub and Bitbucket.

### 1 · Just be git, with a few conveniences

**Nothing in a Càrn repository requires Càrn.** There's no custom refs a stock client has to know about, no metadata objects, and no `refs/carn/*` namespace. A repo cloned from Càrn is byte-identical to one cloned from anywhere else.

**Issues and PRs are Postgres-built conveniences.** If Càrn vanished overnight, you'd have all your commits but none of your issue or PR descriptions. A nightly `pg_dump` (hehe) and an export command (`carn export <repo>` → directory of .md files) help to mitigate the risks.

### 2 · Fast and responsive is sexy

This one is nearly free. **There's no sessions. No private repos. Every read page is identical for every visitor.** No `Vary: Cookie`, no per-user rendering, no authorization checks to invalidate. You can put real cache headers on repo pages and let Caddy serve most requests without touching Node. Most forges can't do this.

The page budget is a promise that governs how everything is architected:

- **Zero client JavaScript.** Progressive enhancement only. A page that needs JavaScript to render something has failed.
- **100 KB pages.** Everything, including fonts, assets, page chrome, and stylesheets. Measured as wire bytes at gzip level 5, matching Caddy's default setting.
- Measured in process at gzip level 5 until Caddy exists. Phase 2's `encode` must compress at least as well.
- **TTFB under 100 ms** on a warm repo page. Achievable given the measured numbers. The whole budget is 5–10 git subprocesses at ~2 ms each, so the pooled `cat-file --batch` matters most for hitting this metric.
- **Cache highlighted blobs by content hash**, and set `Cache-Control: public` on anything keyed by an immutable SHA; a commit page can be cached literally forever.

### 3 · Secure and accessible makes pages impressible

Security is covered throughout: UUID paths, no HTML in Markdown rendering, blob origin isolation, the semaphore, and rate limiting (§04), to name just a few. Everything is WCAG 2.2 AA compliant across the board.

Accessibility conformance requires a thoroughly brutal color palette:

> **MEASURED CONTRAST**
>
> In light mode, `--accent` (#E7156C) has a contrast ratio of 4.10:1 against `--ground` (#F4F6F6). That passes AA for large text (3:1) and for non-text UI, but misses the 4.5:1 threshold for body-size text. The `--accent` token is therefore only used for big type, rules, and focus rings. A darker `--accent-text` (*#C9105C) with a 5.22:1 contrast ratio is used for everything else: inline links, small type, directory names in a file list, and the fills behind buttons, tags, and chips. BRAND §02 details the token split and every measured ratio.

- **The display face never sets body text.** All-caps removes the ascender/descender profile upon which word-shape recognition depends. Uppercase Carn Sans is used for titles and labels; Carn Sans at `"wght" 400`, or Carn Mono, for sentences. There's no third family or separate body face. See BRAND §03 for more details.
- **Real semantics.** Nearly everything is a `<table>`. It works just as well in a terminal browser, in an email, maybe even on an old Nokia phone. You know how people like to [try and run Doom](https://www.reddit.com/r/itrunsdoom/) on anything that reads binary code? It's kinda like that. The table views – file tree, repo index, commit log, branch/tag lists, and commit page file list – all carry a `<caption>`, a `<thead>` of `<th scope="col">`, and a `<th scope="row">` for the table name.
  - **Columns come from the table layout.** Never from `display` overrides. A grid or flex override doesn't give you anything new, but it does beef your table semantics. See _Tables, CSS Display Properties, and ARIA_ by Adrian Roselli.
  - **Table layouts are fixed.** Never auto. `auto` can't size a column below its min-content width, and a name that doesn't wrap has the whole string as its minimum, causing a table to outgrow the viewport instead of truncating the name.
- **Keyboard first.** A skip link, visible focus on everything, and no hover-only behaviors. A file row's actions are always reachable by the tab key.
- **Meaning and intent don't rely on color alone.** Directories have trailing slashes in lists to differentiate from files. Diffs have `+` and `-` glyphs to indicate adds and removals.
- **No motion.** A fast-loading page already _feels_ smooth. Animations are what slow sites use to disguise being slow. The only transitions worth having are hover and focus states, and those should be instantaneous.

### Turning tenets into tests

Unit and integration tests are for little tiny babies. We are not little tiny babies. [Tuffgal](https://github.com/nschneble/tuffgal) is the instrument of choice. A forge is mostly glue over `git`. The interesting failures aren't "Does this function return 42?" They're "Did that clone operation work?" and "Did this page get all weird?" **Tuffgal stories are for the user journey, and contract tests are for the unseen world.**

> **WHY THIS SUITS CÀRN UNUSUALLY WELL**
>
> Visual regression is normally flaky due to page nondeterminism. DOM hydration reordering, late async data arrival, client state persistence, mid-frame animations; it's a mess. **Càrn has none of this.** Server-rendered HTML, no client JavaScript, no sessions, no motion. The page is a pure function of the request. That makes screenshot diffing a genuinely reliable mechanism here.
>
> Tuffgal's **clock freezing** keeps relative dates from constantly generating new baselines. The **a11y-tree snapshots** directly serve the a11y tenet by catching structural regressions.

#### The first user journey on the road to baseline perfection

Four stories cover the basic shape of Càrn's ecosystem. Here's an illustrative example:

```
// the whole product in one story

navigate  /r/fixture
click     "New issue"      → shot
input     title, body      → shot
click     "Create"         → shot  // issue page, ladder at OPEN
click     "Create branch"  → shot  // ladder at BRANCH
~         ~                ~       // push commits via fixture hook
click     "Open PR"        → shot  // ladder at PR, diff rendered
click     "Squash merge"   → shot  // ladder at MERGED, issue auto-closed
navigate  /r/fixture       → shot  // branch gone from list
```

The other three stories:

- **Repo browse:** Tree → blob with highlighting → commit log → single commit
- **README render:** A README fixture exercising every CommonMark construct plus a table, which doubles as a Markdown-pipeline regression test
- **Empty states:** A repo with no commits, an issue list with nothing in it, a PR with a conflict

Run all of these across all breakpoints. The layout leans on `clamp()` for the display type and on the compensated small-caps rule for filenames; both often look great on your laptop and wonky on your phone.

> **THE FIXTURE REPO HAS TO BE BYTE-REPRODUCIBLE**
>
> This is the one setup task that's gotta do what it says on the tin. **A commit SHA is derived from its content _and_ its author and committer timestamps.** Build the fixture repo in a script and the SHAs change on every run. Bad bad bad.
>
> Instead, build it once with `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` pinned to fixed values, then **commit the resulting bare repo as a tarball** and have the per-breakpoint fixture hook restore it. The same goes for the seed rows in Postgres: fixed IDs and timestamps.

#### Contract tests, a.k.a. what Tuffgal can't see

These aren't really a secondary test suite so much as non-visual assertions outside a screenshot's purview:

| Contract         | Assertion                                                    | How                                                                                                            |
| ---------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- -------------------------------------------- |
| **A11y rules**   | Zero axe violations                                          | `axe-core`. Tree snapshot catches structural drift. Axe catches rule violations like contrast and ARIA misuse. |
| **Headers**      | Blob origin always returns `sandbox` CSP, never `Set-Cookie` | Plain request assertions, covering the three vulnerability classes in §11.                                     |
| **Subprocesses** | < 12 `spawn` calls per render                                | A counter in the git layer, asserted per route. **The most valuable test in the plan.** See below.             |
| **Weight**       | Page < 100 KB, zero client JavaScript                        | `size-limit` against the rendered HTML plus assets.                                                            |

The subprocess counter is the only test that'll catch a specific way this codebase could fail its performance tenet. A well-meaning refactor that renders a file list by calling `cat-file` once per row would pass every other check. The screenshots would be pixel-identical; the HTML byte-identical. Yet it'd quietly bloat a 40 ms page load to 400 ms. Nothing else in the suite would notice.

> **WHY TO BOTHER WITH A MIRROR CI**
>
> Tuffgal's design, where **CI is the sole writer of baselines**, pairs nicely with the GitHub Actions plan in §. Lint and typecheck on the mirror are nice-to-haves. A _visual review as a PR gate_ is the show. The `tuffgal-action` runs on the mirror, publishes candidates as artifacts, and you approve with `tuffgal approve --from` and commit.
>
> The status endpoint (§07) becomes the natural place for Tuffgal's exit code, where **2 (pending baselines) is a distinct state from 1 (failure)**, so we can support "review needed" as a real state in between pass/fail.

## 01 · The shape of it

_What you're building and why it's tractable_

A single Node process serving three things: a server-rendered web UI, anonymous git-over-HTTPS for reading, and an SSH listener for writing. Postgres holds metadata. Git objects stay on disk and are read by shelling out to plumbing. That's the whole system.

Two things enable us to compress this into a sprint-sized timeline:

1. **`git merge-tree --write-tree`** (git 2.38+) performs a real three-way merge; rename detection, directory/file conflicts, and recursive ancestor consolidation in a bare repo with no worktree and no index, and prints the merged tree OID. Combined with `commit-tree` and `update-ref`, the entire server-side merge engine is about fifty lines.
2. **"Everything public, no private repos"** is like a scope shrink ray. Reads over HTTPS don't need authentication. Writes are by SSH keys. There's no password column, no session store, no login form, no password-reset email, and no read-authorization check on any route. A potential API or CLI can authenticate over SSH with the same key, so no tokens, either.

> **THE BIGGEST RISK**
>
> It isn't purely technical. It's that this becomes the only home of a codebase before it's earned that trust. A bad force-push, a disk failure, or a bug in the merge path and that trust is gone. The mitigation is in [§10](#mirror): mirror-push every repo outward from day one.

## 02 · Decisions, decisions

_Settled and assumed by everything downstream_

- **Accounts:** Admin-created. No signup routes.
- **Approach:** Built from scratch. No adopted forge, no comparison app. This is the project.
- **Assignment:** None. No owners, no assignees. They're just issues and PRs.
- **Comments:** Thread-only. Inline diff comments are on the roadmap, but not in the MLP.
- **Credentials:** SSH keys only. No passwords, no sessions, no API tokens.
- **Highlighting:** highlight.js does all we need.
- **Labels:** Never. Epics do the job.
- **Layout:** One display rule: List items in the display face; titles on show views. Mockups in §06.
- **License:** AGPL-3.0-or-later, both server and CLI. Closes a network loophole left open by plain GPL.
- **Merge:** Server-side button. Merge commit, squash, or fast-forward. Never rebase-merge.
- **Method:** YAGNI. Nothing gets built before it's wanted.
- **MLP:** Repos, issues, PRs. Browse, clone, push, file, propose, and merge. Releases to follow.
- **Name:** Càrn / carn: Càrn on every visual surface, `carn` everywhere technical. Montréal / montreal-repo.
- **Numbering:** One sequence. Issues and PRs share a per-repo counter; reasoning below.
- **Rate limiting:** At the edge: Caddy, three tiers, tightest on clone and archive.
- **Rendering:** Server-rendered. The app is just documents. No SPA here.
- **SSH transport:** Embedded (ssh2): One container, no sshd wiring. Migration path noted in §03.
- **Stack:** Node / TypeScript. Reuses the Linklater Compose file, Caddy config, and deploy pipeline.
- **Testing:** Tuffgal stories. Visual regression as the primary suite, plus contract tests. No unit or integration tests.
- **Themes:** Light and dark modes. Dark by default cuz it's the punkiest.
- **URLs:** /r/ prefix: `/r/:repo`. Structurally kills any namespace collisions. No reserved list.
- **Visibility:** Public, always.
- **Write path:** CLI only. Comments over SSH. The web UI is read-only until the merge button in 08 · 04, which is the sole exception for the MLP. The admin forms in §06 come after.

### Issues and PRs share a per-repo counter

Why? Cross-references.

You want `#12` in a commit message or PR body to become a link. With separate sequences, `#12` is ambiguous and you'd need a disambiguating sigil, e.g. how GitLab uses `#12` for issues and `!12` for merge requests. A shared counter makes `#12` resolve to exactly one thing. GitHub does this for the same reason. It also makes the issue→branch→PR flow read naturally: issue #12 produces produces PR #13, and every reference is unambiguous.

Implement as a `next_number` column on `repos`, incremented in the same transaction that inserts the row. Not `MAX(number)+1`, which races and is the absolute worst.

### No assignees

No need for a column or filter UI. **But we'll keep `author_id`**. It's one nullable foreign key, and `pr_events` needs an actor for the timeline anyway.

## 03 · What's actually difficult

_Verified against git 2.43 in real bare repos_

There's four areas where a naive implementation could produces show-stopping bugs.

### 1 · The merge engine

This recipe is from the `git-merge-tree` man page,:

```bash
# resolve to OIDs FIRST; see trap a.
old=$(git rev-parse refs/heads/main)
src=$(git rev-parse refs/heads/feature)

tree=$(git merge-tree --write-tree -z $old $src)
commit=$(git commit-tree $tree -F msg.txt -p $old -p $src)

# compare-and-swap
git update-ref refs/heads/main $commit $old
```

Traps:

a. **Exit code 1 doesn't always mean "conflict."** The man page says it does. It doesn't: an unknown ref also exits 1, with empty stdout. Discriminate on _stdout_: a conflict prints a hex OID on line one, whilst an error prints nothing. Resolving refs with `rev-parse` first makes the case unreachable.
b. **It writes objects.** Every "can this merge?" preview leaves orphan blobs and trees. On git ≥ 2.50 use `--quiet` for the mergeability check; it exits early and writes almost nothing. Either way, you need a scheduled `git gc`, which you'll want regardless because `receive.autogc` defaults to _on_ and will otherwise stall an unlucky push for minutes on a shared-CPU box.
c. **Always pass `-z`.** Without it, filenames are shell-quoted per `core.quotePath` and the conflict section is explicitly documented as non-machine-readable. With it, you get NULL-delimited records where the stable field is the conflict _type_ (`CONFLICT (contents)`); always parse that, never the human readable message.

**Squash** is the same call with a single `-p`. Set `GIT_AUTHOR_*` and `GIT_COMMITTER_*` explicitly. A daemon has no gitconfig and `commit-tree` will refuse with "Author identity unknown." Use `-F` for the message, never `-m` with interpolated user text. **Fast-forward** skips the tree entirely: `git merge-base --is-ancestor`, then `update-ref`.

> **THE CONCURRENCY RULE**
>
> The merged tree is only valid against the target head you merged _from_. So: read `old` → merge → commit → `update-ref <ref> <new> <old>`. On exit 128 (CAS mismatch), **re-read and re-merge**. Never retry with the stale tree, and never fall back to the two-argument `update-ref`; that's a silent force-push that discards whatever landed concurrently.

### 2 · Git over SSH

**Using a hardcoded key is only for Phase 0.** In Phase 1, keys come from the `ssh_keys` table, and `ssh2` handles any number of users perfectly well; Gitea and GitLab implement the same authenticate-against-a-database pattern, just via OpenSSH's `AuthorizedKeysCommand` instead of an embedded server. Additional users are not degraded by the embedded server.

The two real differences: the port (`:2222` unless you do the swap in [§09](#hosting)), and that you own an SSH server's auth code in-process rather than delegating to OpenSSH. `ssh2` is at v1.17.0, with roughly one release a year and a single maintainer; bus factor 1, yes, but it's acceptable here. The escape hatch is contained: authorization logic lives in the app either way, so switching to OpenSSH later is always an option.

Two things to watch out for:

- **Public-key auth is two-phase.** The first callback arrives with `ctx.signature === undefined`. That's the client probing whether the key is acceptable. You must `ctx.accept()` the probe; only the second call carries a signature to verify.
- **The `env` request object is `{key, val}`**, not `{key, value}`, despite the README. Reading `.value` yields undefined, `GIT_PROTOCOL` never reaches the child, and every clone quietly downgrades to protocol v0 with no visible errors.

Also worth mentioning: reject `shell`, `pty`, and `subsystem` requests outright. Call `stream.exit(code)` _then_ `stream.end()` or the client hangs. Pipe child stderr to `stream.stderr`; that's how `remote:` messages surface. Persist the host key across restarts.

### 3 · Smart HTTP for anonymous clones

Spawning `git upload-pack --stateless-rpc` is right, with three caveats:

- **`--advertise-refs` doesn't emit the service header.** `git http-backend` prepends `001e# service=git-upload-pack\n` + `0000`; the raw command doesn't. Omit it and v0 clients die with `fatal: invalid server response`.
- **That header is protocol-v0 only.** Under `Git-Protocol: version=2` the body starts at `000eversion 2\n` with no service line. Branch on the request header, and forward it into `GIT_PROTOCOL` for both the GET and the POST.
- **Gzipped request bodies aren't an edge case.** The client compresses the POST body once a repo accumulates refs. Skip the gunzip and it works perfectly on toy repos, then breaks later for no visible reason.

### 4 · Reading repos

**It's all about process spawn cost.** Shell out to _plumbing_, not porcelain: `git diff-tree -r -M`, never `git diff`. Porcelain honors `diff.external`, textconv, and color config from whatever gitconfig the daemon happens to see. `ls-tree -z --long` for trees, `for-each-ref` for branch lists (one process instead of N), and `rev-list --count` for pagination.

**Example measurement:** 200 separate `git cat-file` processes took **370 ms**. The same 200 lookups through one long-lived `git cat-file --batch` took **7 ms**. On small repos, essentially all the cost is process startup. `rev-parse` costs the same as `log -n 20`. A page doing 5–10 spawns is fine; anything rendering N blobs needs a pooled `--batch` process per repo, recycled after each push.

> **NON-NEGOTIABLE SUBPROCESS HYGIENE**
>
> Always `spawn` with an args array, **never `shell: true`**. Put `--` before every path. Reject refs starting with `-`. Set a hard timeout and kill the child on `req.on('close')`, or abandoned clones pile up `pack-objects` processes until the box OOMs. Cap global concurrency with a semaphore.

## 04 · Architecture

_One box, one database, four listeners_

```
               :443                              :22 (or :2222)
                 │                                     │
            ┌────▼────┐                                │
            │  Caddy  │  TLS, static assets            │
            └────┬────┘                                │
     ┌───────────┼────────────┬──────────┐             │
  /r/:repo   /info/refs    /*.json     raw.*          ssh2
  (web UI)  (smart HTTP)  (read API)  (blobs)  (exec → git-*-pack
     │           │            │          │      + CLI commands)
     └───────────┴─────┬──────┴──────────┴─────────────┘
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

### Repo storage

Store repos at `/var/lib/carn/repos/<uuid[0:2]>/<uuid>.git`, where the UUID is the primary key. URLs and SSH commands carry the bare repo `name`, which is a _database lookup_ returning a UUID. No user-controlled string ever reaches a filesystem path.

Path traversal is empirically the number-one bug class across forge implementations: several CVEs across 2025–26, including a CVSS 9.5 arbitrary-write-to-RCE. Note that `filepath.Join`-style joining _resolves_ `..`, it doesn't contain you. Deriving the path from a UUID means the check never has to be right, because the dangerous input never gets there. It also makes rename a single `UPDATE`, which is the fix for push-to-create typos.

### Markdown

Strict CommonMark with one deviation. We're staying close to pure Markdown and skipping GitHub's special-casing:

```ts
const md = new MarkdownIt('commonmark', { html: false }).enable('table');
```

**markdown-it 15.0.0** is the pick. It's semantically 100% conformant to CommonMark 0.31.2; the only three spec-suite failures are `<blockquote></blockquote>` whitespace, it's ~4× faster than the remark/unified pipeline, and as of v15 it ships first-party TypeScript types, making `@types/markdown-it` obsolete.

> **NEVER HTML**
>
> `new MarkdownIt('commonmark')` sets **`html: true`** by default. The `'commonmark'` preset is a _spec-conformance_ preset, not a safety preset. CommonMark mandates raw-HTML passthrough, so `md.render('<script>alert(1);</script>')` returns it verbatim. A plain `new MarkdownIt()` instantiation is safe, but with the `'commonmark'` preset we must pass `{ html: false }` explicitly.

**Tables are the only [GitHub Flavored Markdown](https://github.github.com/gfm) (GFM) extension worth enabling**, because there's no CommonMark way to express tabular data, so a table degrades to visible garbage. Everything else degrades gracefully: `~~x~~` reads fine literally, `- [ ] todo` renders as `[ ] todo`.

The GFM spec is frozen at 0.29-gfm dated April 2019, anchored to CommonMark 0.29 while CommonMark is at 0.31.2, and GitHub has since shipped
footnotes, alerts, and math outside it. There's no current standard to implement.

### Sanitization

_Spoiler: We don't need a sanitizer._

With `html: false`, markdown-it's output vocabulary is fixed and small. That's the allowlist, enforced by construction. Its `validateLink` blocks `javascript:`, `vbscript:`, `file:`, and `data:`; re-permitting `data:image/{gif,jpeg,png,webp}` but deliberately _not_ `svg+xml`. It runs at every destination: inline links, images, reference definitions, and both autolink paths. Entities are decoded before validation, so strings like `java&#115;cript:` are always caught. **Fun fact:** roughly 55 bypass attempts all failed.

What we do need is a URL policy to deal with cross-site scripting (XSS):

- **Third-party image loading.** `![x](http://evil.com/t.png)` renders, and every visitor to that README pings `evil.com`. On a public forge, this could be ripe for abuse. Fixable with a CSP `img-src` and/or an image proxy. _The CSP half shipped in Phase 1a; a README's remote image is blocked and degrades to its alt text. The proxy half is deferred for after MLP._
- **Unbounded scheme allowlist.** `validateLink` provides a limited blocklist, so `blob:`, `about:`, and custom app schemes all pass. Replace it with an allowlist of `https|http|mailto` plus the data-image forms, and reject protocol-relative `//`. _Shipped in Phase 1d: `allowLink` in `src/markdown/render.ts`._
- **No `rel`.** Add `rel="nofollow ugc"` to external links via a renderer rule override. _Shipped in Phase 1d: a `link_open` override in `src/markdown/render.ts`. Applies to absolute `http(s)` links only; relative links, anchors, and `mailto:` are untouched, and there's no same-host carve-out._
- **Relative links resolve incorrectly.** A README's `[license](LICENSE.md)` renders as a link to `/r/:repo/LICENSE.md`, which isn't a valid route. `allowLink` passes schemeless destinations through unmodified on purpose, but then nothing rewrites them to the correct route signature at `/r/:repo/blob/:rev/:file`. The same applies to relative images: `![diagram](docs/arch.png)` is schemeless, so it resolves incorrectly and fails to render. Rewriting relative images to the first-party content-addressed asset route allows committed images in READMEs to work under `img-src 'self'` with no CSP changes. _Shipped in Phase 1e: `renderMarkdown` takes a `{ repo, rev }` base, and the `link_open` and `image` renderer rules rewrite every schemeless destination; links go to `/r/:repo/blob/:rev/*`, images to the content-addressed `/r/:repo/blob-asset/:oid.ext`._ **Rewriting is unconditional: nothing checks if the files are actually there.** A check would cost a path lookup per link against the 12-spawn budget, and would make the same README render differently on `main` than on an old tag.
- **The social card is one static image for the whole site.** `og:image` and `twitter:image` point at `/images/preview.jpg` on every page, so a repo shares the index's card. The repo's own identity, i.e. its committed header at `/r/:repo/header/:asset` or its generated wordmark, will be subbed in post-MLP. The wordmark will need JPEG or PNG rasterization since crawlers can't render SVGs for social cards.

The markdown layer and response header deliberately disagree about remote images: `allowLink` permits an `https:` image URL that CSP then refuses to load. The parsing layer parses (obviously) and the header enforces, so the enforcing layer being stricter is correct.

> **WHAT IF WE JUST GOTTA SANITIZE AT SOME POINT?**
>
> Use `rehype-sanitize` or `sanitize-html`. Both scored zero real leaks in testing. **Don't use DOMPurify with linkedom.** It's widely recommended online as a fast jsdom alternative, and it _silently does nothing_. Feature detection fails, `isSupported` is falsy, and `sanitize()` returns its input unchanged without any errors. If you do use DOMPurify server-side, assert `DOMPurify.isSupported === true` at startup and and budget for jsdom's 122 MB RSS and 600 ms init.

### Raw blobs

**Serve blobs from a separate hostname.** This is the control that does all the work for us. GitHub serves everything from
`raw.githubusercontent.com` as `text/plain` (even `.html` and `.js` files), with a small image allowlist (gif/jpeg/png/svg/webp) getting real MIME types:

```
Content-Security-Policy: default-src 'none'; sandbox
Content-Type: text/plain; charset=utf-8
Cross-Origin-Resource-Policy: same-site
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

SVG is the special case. It's active content that can carry a `<script>` tag. Either serve it as `text/plain` like everything else, or give it `image/svg+xml` from the separate origin behind the CSP. Plain text is safer, but READMEs with SVG image tags won't render.

**The origin won't exist until Phase 2.** The DNS records are a Phase 2 pre-flight and nothing serves on `gelatinous-cube` yet, so links like `Show entire file` and `Open raw` are gated on `CARN_RAW_ORIGIN` in `config.ts`.

**Inline images don't come from that origin.** The CSP is `img-src 'self' data:`, so a second hostname is blocked, and widening `img-src` to admit it would undo the isolation the origin exists to provide. A small image blob renders first-party through the content-addressed, immutable route established at `/r/:repo/header/:asset`, with the same `committed()` guard that stops it reading an arbitrary OID. The second origin is only for downloading untrusted content, not for embedding it.

### Syntax highlighting

**Càrn relies on highlight.js 11.12.0.** We register only the languages actually being served (`highlight.js/lib/core` plus explicit `registerLanguage`): 15 ms init, 56 MB resident, ~49k lines/sec, and **class-based output at 111 bytes per line**. This was measured across 46 files sampled evenly through Linklater's 832-file TypeScript corpus, which gzipped to **10.2 B/line, 9.2% of raw**.

It's wired through markdown-it’s `highlight` option, whose return values are inserted verbatim, so we always have to return escaped HTML. **Cache highlighted blobs by content hash.** Highlighting is pure, so a hash→HTML cache removes the cost entirely on repeat views and keeps inside the TTFB budget.

### Cross-reference autolinking

You want `#12` in a commit message or body to link, plus commit SHAs. **Do it as a markdown-it core rule.** Never do a post-render regex over the HTML. The regex approach produced three bugs on a small test input: it linkified inside `<code>` spans and fenced blocks, and it produced **nested `<a>` tags**, which is invalid HTML that browsers _repair_ by restructuring the DOM.

Working at the token level gives you the exclusions for free: `fence` and `code_block` are block tokens with no children, `code_inline` is its own type you simply skip, and tracking `link_open`/`link_close` depth prevents nesting. You also get to transform the display text – a 40-char SHA rendered as 7 chars – which a string regex can't do cleanly.

> **REGISTER IT BEFORE `TEXT_JOIN`**
>
> markdown-it's core chain ends `… → replacements → smartquotes → text_join`. If you `core.ruler.push()` you run _after_ `text_join`, which merges adjacent text tokens, at which point `\#12` (deliberately escaped) has been flattened into plain text reading `#12`, and you'll linkify it anyway. Use `md.core.ruler.before('text_join', 'xref', …)` and the escape survives as a distinct `text_special` token you can skip.

Additionally, you should pass a resolver through markdown-it's `env` object, so `#999999` for a nonexistent issue doesn't become a dead link.

### Rate limiting

The shape differs from Linklater's because the expensive requests aren't the frequent ones. Two mechanisms, both needed:

- **The semaphore (§03) bounds concurrency:** it stops ten simultaneous clones from OOMing the box.
- **Rate limiting bounds volume:** it stops a crawler from making 10,000 cheap requests, or one making a hundred expensive ones in sequence.

Do the coarse limiting **at the edge, in Caddy**, so an abusive request never reaches Node and never forks a git process. That needs `mholt/caddy-ratelimit` via `xcaddy`. It's not in standard builds, and the README says "This isn't an official repo of the Caddy Web Server organization," but it's written by Caddy's author, it's stable, and it gives you a true sliding window (a ring buffer).

Three tiers:

| Zone               | Budget    | Why                                                                                                                                                       |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive generation | 5/min     | Tightest. Fully CPU-bound, trivially amplified, and the classic crawler trap: a bot walking every tag × every format will pin the box. GitLab uses 5/min. |
| `git-upload-pack`  | 10–20/min | Each forks a process and can pack the whole history. Partial-clone flags make individual cost wildly variable, so limit count.                            |
| Pages, assets      | ~300/min  | Cheap and cacheable. Generous.                                                                                                                            |

> **IMPORTANT DETAILS**
>
> **Key on `{client_ip}`, not `{http.request.remote.host}`** even though the plugin's own README example uses the latter. They're identical on your VPS with Caddy at the edge, but the moment anything sits in front, `remote.host` silently becomes the proxy's address and your rate limit collapses into a global bucket. Set `trusted_proxies` and use `{client_ip}` so it's correct in both topologies. The Node-side equivalent of this mistake is `app.set('trust proxy', true)`, which lets any client forge `X-Forwarded-For`; use a numeric hop count instead.
>
> **Set `ipv6_prefix 56`, not 64.** A /64 is one LAN, but residential subscribers are typically _delegated_ a /56 or /48, so a per-/64 limit still leaves an attacker 256+ buckets to rotate through. /56 stops the realistic attack; loosen to /64 only if you get collateral-damage complaints.

Keep a coarse in-app limit as defense in depth on the write paths. Use `rate-limiter-flexible` (v11, actively maintained, memory backend w/out Redis) with a per-key `blockDuration` so repeat abusers escalate. Note that it's a "flexible fixed window" and not a true sliding one. Add failed-auth banning on the SSH listener: N failures from an IP in a window, then a temporary block.

### Git config for the box

The defaults are actively wrong for a small shared-CPU VPS: `pack.windowMemory` is unlimited _per thread_, and `pack.threads` auto-detects CPUs, so peak RAM is two unbounded numbers multiplied together.

```
[core]
  bigFileThreshold = 16m   # skip delta search, stream large blobs
  logAllRefUpdates = true  # OFF by default in bare repos; your only undo
[pack]
  deltaCacheSize = 32m     # default: 256 MiB
  threads = 1              # RAM multiplies by thread count
  windowMemory = 64m       # default: UNLIMITED per thread
[receive]
  autogc = false           # default ON; stalls pushes (cron it instead)
  fsckObjects = true       # safe on push: quarantine env
  maxInputSize = 100m      # default: no limit
[uploadpack]
  allowFilter = true       # lets clients ask for LESS work
```

### Repo size limits

Without LFS, there's nothing structural stopping a repo from growing out of control. On an 80 GB disk shared with Postgres, _one_ accidental `git add` of a `node_modules` or a video file is permanent. Git never forgets; the only fix is a history rewrite.

Three limits, at three different layers:

- **Per-file:** `core.bigFileThreshold = 16m` is already set and does half the job; files above it skip delta compression entirely, which removes most of the CPU pain, but does nothing for clone size.
- **Per-push:** `receive.maxInputSize = 100m`, defined in the config above. Bounds a single push.
- **Per-repo:** A soft warning and a hard block, checked in `post-receive` against `git count-objects -vH`. Something like warn at 500 MB, refuse further pushes at 1 GB. Surface it as `carn repo size` and on the repo settings page so it's never a surprise.

These are guardrails against accidents, not defenses against attacks.

Add `flush_interval -1` to the Caddy site block for the git routes. Pack streaming is long-lived and chunked, and Caddy's auto-detection of streaming responses is undocumented, so don't rely on it. Don't let `encode` re-compress an already-compressed pack, and raise timeouts well above your largest clone.

## 05 · Data model

_Ten tables for the whole MLP, plus releases_

Postgres is the source of truth for everything _except_ git objects, which live on disk and are read through plumbing. Never mirror commit data into the database beyond rebuildable caches.

```sql
users          id, handle, display_name, email, is_admin, created_at
               -- no password column; SSH keys are the only credential

ssh_keys       id, user_id, name, public_key, fingerprint, created_at, last_used_at
               -- unique on fingerprint; This is the entire auth system

repos          id (uuid), owner_id, name, description, default_branch, next_number, created_at
               -- unique (owner_id, lower(name)); id drives the disk path, rename is one UPDATE, everything is public

repo_grants    repo_id, user_id, level
               -- level enum = write | admin; read is implicit for everyone

issues         id, repo_id, number, author_id, title, body, parent_id NULL, state, created_at, closed_at
               -- an issue with children is an epic; shares repos.next_number with pull_requests for number

pull_requests  id, repo_id, number, author_id, title, body, source_branch, target_branch, state, merge_commit_sha, merge_strategy, issue_id NULL, created_at, merged_at
               -- state enum = open | merged | closed; issue → branch → PR; shares repos.next_number with issues for number

comments       id, subject_type, subject_id, author_id, body, created_at, file_path NULL, line NULL
               -- one table for issues and PRs since they're the same thread; inline review is on the roadmap

events         id, subject_type, subject_id, actor_id, kind, payload, created_at
               -- opened | closed | reopened | pushed | merged | referenced; renders timelines, powers the activity feed + audit log

releases       id, repo_id, tag_name, target_sha, name, body, created_at
               -- tags are releases, releases are tags; tarballs from `git archive` on demand, never stored

settings       key, value, updated_at
               -- single-row-per-key placeholder: site title, default branch, name, mirror targets; viewer prefs go in a cookie
```

### Epics are the new labels

**`issues.parent_id`, self-referential:** an issue with children _is_ an epic. No separate milestones table, no epic type. A standalone issue has a null parent and no children; promoting it is a single `UPDATE` on its would-be children.

Labels are cut entirely. For one person, an epic plus open/closed carries the same weight labels usually have for a team, where they mostly encode _who should look at this?_

### Ownership and admins

There's only one role: admin. Yet there's a difference between admins and repo _owners_. An admin you add can remove you in turn. But an admin can never undo repo ownership:

> **OWNER IS A FACT, ADMIN IS A GRANT**
>
> Keep `repos.owner_id` as the immutable creator, and make the rule: **an admin can grant and revoke any grant except the owner's.** Transferring ownership requires the owner. It's not a second role; `repo_grants` still holds only `write` and `admin`. It's one line in the authorization check.
>
> This isn't about preventing repo coups. It's about avoiding painful accidents. A mis-typed `carn repo grant --revoke` that locks you out of your own repository is only recoverable by manually editing the database. Fixed with a single immutable column.

### Users have a minuscule footprint

There's three areas that users typically inhabit, and we're skipping two of them:

- **Handles: yes, you need them anyway.** Not for URLs, but for the SSH key lookup, the CLI's identity, and for mapping a commit's author email back to a user so the UI can say who did what. It's already in `users.handle`.
- **`/users` and `/u/:handle` pages: no.** With one user, they'd be a directory of one. Build them if and when they're needed.
- **`@mention` autolinking: no.** There's nobody to mention, and no notification for a mention to trigger.

### Do issues need PRs?

A PR needs no issue; plenty of changes are just changes. But an issue's _natural_ resolution is a PR that satisfies it, and that asymmetry is worth making visible rather than leaving implicit in a nullable foreign key.

**Render it as a ladder on the issue page:** a five-step state showing exactly where a piece of work has gotten to:

```
OPEN → BRANCH → PR → MERGED → CLOSED
```

Each step is derived, not stored: the branch exists if a ref matching `<n>-*` is present, the PR exists if a row points back with `issue_id`, and merged comes from its state. There's nothing new in the schema.

The payoff is the ladder _is_ the affordance. At each step, the next action is the obvious button: _Create branch_ when there's only an issue, _Open PR_ when the branch has commits, _Merge_ when the PR is clean. That's the "little Jira," and it's a template rather than a feature. The escape hatches stay open: close an issue as wontfix, or fix it in a direct commit to `main` and let the `closes #12` reference do the work; the ladder just shows a shorter path.

### One comments table, one events table

Issues and PRs are the same object with different attachments: a title, a body, a thread, and a timeline. Polymorphic `subject_type`/`subject_id` columns keep them as one code path in the UI and one query for the activity feed (later on the roadmap). The alternative, parallel `issue_comments` and `pr_comments` tables, means writing every rendering and notification path twice.

## 06 · Interface

_One design language across every view_

The page shapes are specified in a [companion study](https://claude.ai/code/artifact/587c7ac1-5712-4927-bb82-8e5a80731f80). The [pre-build mockups](https://claude.ai/code/artifact/6a95e6fc-3a60-416b-a496-b713a5005be1) the study was drawn against are also available. The shipped pages have since superseded them.

One rule defines every page: **the display font face is for whatever the page is about.** On a list that's the items: filenames, repo names, issue titles. On a show page it's the subject title. On a create page it's the question. Everything else is in a monospace font; small and quiet.

File rows carry three constants:

1. **Directories in `--accent-text` with trailing slashes.**
2. **Table cell hit areas** with hover and focus states.
3. **Last-commit subject plus age** in a monospace font with tabular numerals.

Show at most sixteen rows, then a link to `Show all [N]`.

#### The repo view

```
┌──────────────────────────────────────────────────┐
│ SITE [Repos](/repos)     [Create new repo](/new) │
├──────────────────────────────────────────────────┤
│                                                  │
│ (repo name: hidden h1)                           │
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

**`/prs` and `/prs/:n`.** Consistent between lists and items, and it matches what people say out loud.

**No owner segment, and `/r/` in front of the repo.** Dropping the owner follows from admin-created accounts: with a handful of users and globally unique repo names there's nothing for it to disambiguate. Change `repos`' unique constraint from `(owner_id, lower(name))` to `lower(name)`; `owner_id` stays on the row for attribution, it just isn't in the path.

> **WHY USING THE `/r/` PREFIX IS A GOOD IDEA**
>
> Repo names would otherwise share a namespace with top-level routes, and with push-to-create, a typo is enough to claim one. **The `/r/` prefix makes the collision structurally impossible.** There's no reserved-word list to maintain, no validation rules, and no failure mode. It also keeps the top level free and legible: `/` for the index, `/new`, `/settings`, and `/u/:handle` later if needed for collaborators.

**`/r/:repo/commits` for the log, `?ref=main` to scope it, and `/r/:repo/commits/:sha` for a single commit.** Keeping the ref in a query parameter avoids the collision between a branch name and a SHA occupying the same path slot.

**`/r/:repo/tree/:rev/` redirects 301 to `/r/:repo`.** The repo page is the
root tree, so a tree URL names something below it and a bare ref names
nothing. The redirect drops the ref, which is what the breadcrumb has always
done: `repoTrail` links the repo segment at `/r/:repo` with no ref on every
page, so climbing out of a tree has never preserved one. Nothing in the product
links to the bare form. §13 carries the real fix, `/r/:repo?ref=`.

#### The views

| Route                   | View       | Notes                                                    |
| ----------------------- | ---------- | -------------------------------------------------------- |
| `/`                     | Repo list  | The whole site index. Name, description, creation date.  |
| `/r/:repo`              | Repo       | File tree + rendered README.                             |
| `/r/:repo/blob/:rev/*`  | Blob       | Highlighted source. Raw link points at the blob origin.  |
| `/r/:repo/tree/:rev/*`  | Tree       | The tree below the root. `/r/:repo` is the root itself.  |
| `/r/:repo/tree/:rev/`   | Tree       | Redirects 301 to `/r/:repo`.                             |
| `/r/:repo/commits`      | Log        | `?ref=` to scope. Paginated by SHA cursor, not `--skip`. |
| `/r/:repo/commits/:sha` | Commit     | Diff + cross-refs resolved. Immutable, cache forever.    |
| `/r/:repo/branches`     | Branches   | Each row links to the log scoped to that ref.            |
| `/r/:repo/tags`         | Tags       | Same. A tag gets a page of its own in Phase 5.           |
| `/r/:repo/issues`       | Issue list | Open/closed filter. Epics show nested children.          |
| `/r/:repo/issues/:n`    | Issue      | Body, thread, timeline, "create branch" action.          |
| `/r/:repo/prs`          | PR list    | Same shell as the issue list.                            |
| `/r/:repo/prs/:n`       | PR         | Diff, thread, mergeability, merge button.                |

#### Everything else with an endpoint

The complete surface outside those:

| Route                             | Kind  | Note                                                                          |
| --------------------------------- | ----- | ----------------------------------------------------------------------------- |
| Any view + `.json`                | API   | Read API. Same view model, serialized. No separate route tree.                |
| `POST /api/r/:repo/statuses/:sha` | API   | The one machine-callable write. GitHub-shaped. See §07.                       |
| `/carn.<hash>.css`                | Asset | The stylesheet, hashed on its own bytes. Immutable; cache forever.            |
| `/fonts/:face`                    | Asset | The three font faces. Not content-addressed.                                  |
| `/images/:image`                  | Asset | Two favicons, Apple touch icon, `og:image` card. Not content-addressed.       |
| `cube./r/:repo/raw/:rev/*`        | Blobs | Separate origin. `text/plain` + `sandbox` CSP.                                |
| `cube./`                          | Blobs | The easter egg. See §12.                                                      |
| `/r/:repo/commits.atom` + friends | Feeds | Atom per repo for commits, releases, and issues, plus a global activity feed. |
| `/r/:repo/archive/:rev.tar.gz`    | Git   | `git archive` on demand. The tightest rate-limit zone.                        |
| `/r/:repo/info/refs`              | Git   | Anonymous read only.                                                          |
| `POST /r/:repo/git-upload-pack`   | Git   | No `git-receive-pack` over HTTP; push is SSH.                                 |
| `/health`                         | Ops   | What Caddy health-checks and what the SIGTERM handler flips.                  |
| `/robots.txt`                     | Ops   | See below.                                                                    |
| `/sitemap.xml`                    | Ops   | See below.                                                                    |
| `/new`                            | Web   | Post-MLP admin form.                                                          |
| `/settings`                       | Web   | Post-MLP admin form for site-specific settings.                               |
| `/r/:repo/settings`               | Web   | Post-MLP admin form for Repo-specific settings.                               |
| `/r/:repo/header/:asset`          | Web   | The header image, addressed by blob OID. Immutable; cache forever.            |
| `/r/:repo/releases`               | Web   | Phase 5.                                                                      |
| `/r/:repo/releases/:tag`          | Web   | Phase 5.                                                                      |

#### Sitemap and robots.txt

**The sitemap should list repo, issue, and PR pages only. Never commits, blobs, or archives.** A sitemap enumerating every commit page would be an _invitation_ into the most expensive endpoints. We don't need crawlers walking every tag × every archive format.

`robots.txt` helps enforce this by disallowing `/r/*/archive/`, `/r/*/commits/`, `/r/*/blob/`, and the blob host entirely. Together with the §04 rate-limit tiers, we have three independent layers to mitigate the same risk factors.

#### Feeds

Four feeds: per-repo commits, per-repo releases, per-repo issues, and a global activity feed. All trivial once `events` exists.

**Atom over RSS** for RFC-3339 dates, mandatory stable IDs, and real `xml:base` handling. Serve as `application/atom+xml` and put `<link rel="alternate">` in the page header for autodiscovery.

This also removes any need for notifications.

#### Settings

Split into three facets:

- **Site settings** (`settings` table, key/value, admin-only): site title, the _default_ default-branch name for new repos, the reserved-name list, and the mirror target _pattern_.
- **Repo settings** (columns on `repos`): description, this repo's actual default branch, its specific mirror remote, and archived flag.
- **Viewer preferences** (browser cookie): diff view mode and tab width.

Distinguishing between default branch settings: _default branch name_ is a site setting because it's a policy for repos that don't exist yet. _default branch_ is a setting for an individual repository.

## 07 · API and CLI

We're doing both, built on a shared mechanism, with an unconventional API that's as punk as it gets.

### Why a conventional API sucks

A write API needs to authenticate its caller. The normal answer is personal access tokens; which means a tokens table, a generation UI, hashing, scopes, expiry, and revocation. Our SSH key-only credential system renders it all moot.

But what about `curl`? I love `curl`, I want `curl`!

### The answer: have the CLI speak SSH

The SSH listener already authenticates a public key, resolves it to a user, and receives an arbitrary command string in the `exec` request. Today it dispatches two commands: `git-upload-pack` and `git-receive-pack`. There's no reason it can't dispatch more.

```bash
$ ssh git@carn.fyi issue create linklater "Merge button eats conflicts"
$ ssh git@carn.fyi issue list linklater --open
$ ssh git@carn.fyi pr merge linklater 14 --squash
$ ssh git@carn.fyi repo rename oldname newname
```

Same key, same auth path, same authorization check. **No tokens, ever.** The `carn` binary is then a thin argument-forwarding wrapper over `ssh`. This is how Charm's soft-serve works, and it's the single most elegant consequence of the "no passwords" stance.

### The read API is (nearly) free

Everything is public, so reads don't need authentication. Content-negotiate the existing SSR routes: `Accept: application/json` (or a `.json` suffix that's `curl` friendly) returns a serialized version of the same view model rendered by the template. There's no separate route tree, no separate contract, and no drift between them.

> **ONE THING TO DESIGN DIFFERENTLY**
>
> **Shape the commit status endpoint like GitHub's.** `POST /api/r/:repo/statuses/:sha` taking `state`, `context`, `description`, and `target_url`. It's the one write endpoint that genuinely needs to be callable by a machine that has no SSH key, i.e. an external CI job.

### What about comments?

This is one place the no-credentials stance has a visible consequence.

**The web UI has no authenticated visitors, so it cannot accept writes. Comments have come from the CLI.**

```bash
$ carn issue comment linklater 12 "merge-tree exits 1 on unknown refs too"
$ carn issue comment linklater 12 --editor  # opens $EDITOR
```

The identity is the SSH key resolved to a `users` row. It's coherent, it's the same code path as everything else, and for long bodies it's arguably _better_; `--editor` gives you vim or Nova rather than a textarea that could lose your draft.

> **THE ESCAPE HATCH**
>
> If you later want to comment from a phone or borrowed laptop, the fix doesn't require introducing a password or token. Add `carn web-login`: it runs over SSH, mints a short-lived signed cookie, and prints a one-time URL. Clicking on the URL sets the cookie and the web UI unlocks writes for that browser. Build it when you need it.

### Packaging the CLI

Shipped on npm as [@nschneble/carn](https://www.npmjs.com/package/@nschneble/carn). Three constraints shaped the naming:

- **npm forbids non-ASCII package names.** `càrn` was rejected because a "name can only contain URL-friendly characters," since the name becomes part of the URL. Same with capital letters.
- **`cairn` is taken** by an abandoned React Native styling package, last published in 2022. More awkwardly, **`cairn-cli` was published in May 2026** and already claims `cairn` as its _binary_ name. The whole `cairn-*` namespace is littered like satellites in low Earth orbit.
- **Unscoped `carn` was rejected at publish time.** npm runs a server-side similarity guard that only fires on publish, and it refused `carn` as too close to `yarn`, `cron`, and `acorn`.

**TL;DR: The package is `@nschneble/carn` and the binary is `carn`.**

Scoped names skip the similarity check entirely, and the `bin` key is independent of the package name, so the typed commands are unaffected. Scoped packages default to _restricted_; ensure `publishConfig.access` is set to `public` in `package.json`.

### No more dead branch clutter

Fixes a hearty gripe with GitHub. If you squash merge and delete the remote, the local copy will persist because it doesn't think it's been merged yet. Infuriating and dumb. The solution? `carn tidy`. Details in [§10](#mirror): after the forge deletes a merged branch, this deletes every local branch whose upstream is gone.

## 08 · The build

_Ordered by dependency and gated on working artifacts_

Each build phase may comprise multiple implementation briefs and PRs. The numbered phases are units of scope. The lettered briefs in `docs/phases/` are units of review; one PR each.

**Issues come before PRs** because they build the Markdown pipeline, comment thread, numbering sequence, and cross-reference autolinking; all of which PRs reuse. **Deployment comes early** while things are still relatively simple.

### Before you start

Everything here blocks something later on and is more annoying to do mid-build:

- **Buy the box.** InterServer, 2 slices.
- **Harden it** per the VPS playbook: key-only SSH, UFW, scoped `deploy` user, 2 GB swap.
- **Add the DNS records:** `carn.fancyenchiladas.net` and `gelatinous-cube.fancyenchiladas.net`, A and AAAA, pointed at the box _before_ Caddy starts; it needs them resolving to complete the ACME challenge.
- **Create GitHub mirror repo** as a plain new repo, _not_ a fork. A fork's commits never count toward your contribution graph.
- **Generate a dedicated mirror deploy key (ed25519).** Add it to the GitHub repo with write access and keep it out of your laptop's agent.
- **Generate a second personal SSH key and store it somewhere safe.** Put a printout in a drawer. §11 has the full recovery story.
- **Claim the npm name** `@nschneble/carn`. See §07.
- **Create the Càrn repo itself on GitHub.** It migrates to Càrn when Phase 1 ships.
- **Build the Carn Sans font subset** with the compensated small-caps recipe.

> **GATE:** `ssh deploy@carn.fancyenchiladas.net` works and both hostnames resolve.

### 00 · The spike

Prove the transport works before committing to anything. One file: `ssh2` server on :2222, one hardcoded public key, accept the `exec` request, spawn `git-receive-pack` against a bare repo in `/tmp`. Push to it from your laptop. Then the same for clone.

Separately, spawn `git merge-tree --write-tree` on two divergent branches and confirm a tree OID comes out.

> **GATE:** `git push` to your own daemon succeeds.

### 01 · Core: repos, keys, browsing

- `users`, `ssh_keys`, `repos`, `repo_grants`. Seed yourself as admin from a migration.
- SSH listener authenticating against `ssh_keys`, resolving the repo `name` → UUID → disk path.
- Anonymous smart-HTTP read, with the three corrections in §03.
- Repo list, file tree, blob view with highlighting, commit log, single-commit diff, branch and tag lists, rendered README.
- **Push-to-create:** ~10 lines in the SSH path.
- **Rename:** `carn repo rename`. One `UPDATE` since the disk path is a UUID.

> **GATE:** Your dotfiles repo lives here and the page looks good.

### 02 · Ship it

- Compose file, Caddy config, git config block from §04, 2 GB swap at `swappiness=10`.
- CI builds the image on a version tag, deploys over SSH as a scoped `deploy` user, e.g. the Linklater pattern.
- **SIGTERM handling** in the Node app: flip `/health` to 503, keep serving, wait ~2s, then close. Plus `stop_grace_period: 60s`.
- Backups: `pg_dump` _and_ a tar of the repos directory, nightly, offsite.
- Cron `git gc` across all repos, off-peak.
- The mirror hook from §10, before the box holds anything you'd miss.

> **GATE:** A restore test. Restore the dump and tar into a throwaway box, then clone from it.

### 03 · Issues

- Markdown pipeline: markdown-it, URL allowlist, raw-blob origin.
- Issues table, epics via `parent_id`, comments, events timeline, open/closed.
- Per-repo numbering via `repos.next_number`, in-transaction.
- Cross-reference autolinking as a core rule registered in `before('text_join')`; `closes #12` in a merged PR closes the issue.
- **Create branch from issue** → branch named `12-short-slug`.
- **A minimal CLI over `SSH exec`:** `issue create`, `issue comment`, `issue close`. §07's command surface, widened first by Phase 1f for `repo rename`. The web takes no writes, so this is the only way to reach the gate below.

> **GATE:** From a terminal window, you file a real issue, comment on it, and close it.

### 04 · Pull requests

- Open a PR: source and target branch, title, body. Merge-base, then `diff-tree` against it.
- PR page: file-by-file diff, thread (reusing Phase 3), timeline.
- Mergeability check with `merge-tree --quiet`, cached against the pair of head OIDs so it isn't re-run on every render.
- Merge button: merge commit, **squash**, or fast-forward. CAS loop with re-merge on conflict.
- **Auto-delete the source branch on merge:** §10 covers why this fixes the stale-local-branch problem.
- Auto-close on push when a PR's commits land in its target by other means.

> **GATE:** You merge a real change to a real project through your own UI.

### 05 · Releases

**Tags are releases.** An annotated tag plus notes plus optional attached artifacts, one table keyed on `tag_name`. Tarballs from `git archive` served on demand (rather than stored).

> **GATE:** You cut a real release, write its notes, and download a tarball that extracts to the tagged tree.

### 06 · The CLI

The `carn` binary from §07, wrapping `ssh`. Start with `issue create`, `issue comment`, `issue list`, `pr list`, `pr merge`,
`repo rename`, and `tidy`. Everything else accretes.

> **GATE:** You install `@nschneble/carn` from npm on a machine that has never built it, and file an issue with it.

## 09 · Hosting and deploys

_The VPS playbook, applied_

**A second InterServer VPS (alongside Linklater's) at 2 slices: 4 GB, 80 GB, ~$6/month.** The reason is CPU, not RAM. InterServer allocates roughly one core per two slices on a fair-share basis, and `pack-objects` during a clone is exactly the spiky single-core workload fair-share scheduling handles the worst. Co-locating means cloning a repo would slow down Linklater if they shared a box. A second box also keeps the blast radius independent, which matters when you're redeploying constantly during the build.

| Component               | Steady state      | Notes                             |
| ----------------------- | ----------------- | --------------------------------- |
| Caddy                   | ~30 MB            |                                   |
| Docker + containerd     | ~150 MB           |                                   |
| `git` subprocesses      | burst, 100–400 MB | Bounded by §04 config + semaphore |
| Node app + SSH listener | ~400 MB           | Cap heap at 768 MB                |
| OS (minimal Debian)     | ~150 MB           |                                   |
| Page cache              | ~2.5 GB           | Comfortable                       |
| Postgres                | ~350 MB           | Metadata only; small              |

4 GB is the tier; it's the one workload where the Linklater playbook's "2 GB is genuinely enough" doesn't hold, because git's memory use is bursty and hard to bound.

### Deploys

No blue-green. But about twenty lines gets ~90% of the benefit:

- **A SIGTERM handler:** flip `/health` to 503, keep serving real traffic, wait past `health_interval × health_fails`, then close both listeners and let what's running finish.
- **The SSH drain is what matters.** HTTP requests are short and Fastify's `close()` already waits for them. A clone or push over SSH is the long operation the grace period exists for, so `sshServer.close(callback)` has to be given its callback, and the process exits on that or on a cap under `stop_grace_period`, whichever comes first.
- **`stop_grace_period: 60s`** in Compose; the default is 10s, which'd SIGKILL a long clone.
- **`docker compose up -d --wait`** with a real `healthcheck:` on the app service.
- **`lb_try_duration 30s`** in Caddy, which converts the restart gap from errors into slow requests.

**Realistic gap:** about three seconds, _held_ rather than failed. A clone already streaming a packfile survives if it finishes inside `stop_grace_period`; past that, nothing short of true blue-green saves it.

### Migrations

There's only two rules when it comes to migrations.

1. **Never drop or rename a column in the same deploy as the code change.**
2. **Always `SET lock_timeout`.** Otherwise a migration queues behind a long git operation, takes an `ACCESS EXCLUSIVE` lock, and blocks everything.

**Enforce with `squawk`** (^2.62), a Postgres migration linter with 40+ rules covering the whole `strong_migrations` surface. The ORMs are no help here. Prisma, Drizzle, Kysely, TypeORM, and node-pg-migrate are all runners with no safety analysis. Squawk lints `.sql`, which is what Prisma generates. Point it at `migrations/*/migration.sql` in CI, pin `--pg-version` to the server, commit a `.squawk.toml`, and add the pre-commit hook for local feedback.

Squawk rules to enable on day one: `adding-not-nullable-field`, `changing-column-type`, `constraint-missing-not-valid`, `prefer-timestamptz`, `renaming-column`, `require-concurrent-index-creation`, and `require-lock-timeout`.

> **TWO NOTES on COLUMNS**
>
> 1. Adding a column with a constant default has been safe since Postgres 11. Only a _volatile_ default (e.g. `gen_random_uuid()`) still rewrites the table.
> 2. Non-concurrent index creation has never improved (and never will). Setting `NOT NULL` on an existing column still scans every row, unless you add a `NOT VALID` check constraint, validate it separately, and then set the flag.

### The port swap

Admin SSH moves to :2222 and git takes :22, so the clone URL becomes `git@carn.fancyenchiladas.net:linklater` with no port and no `~/.ssh/config` entry for anyone cloning. **Note:** a high admin port isn't a security improvement. It reduces bot log noise. That's it.

Do the swap in Phase 2, in this order, and there won't be any lockout windows:

1. Add `Port 2222` to `sshd_config` _alongside_ `Port 22`. Reload.
2. Set `ufw allow 2222/tcp`. Open a second terminal and confirm login on 2222 _before touching anything else_. Keep the first session open.
3. Update the CI deploy job's port and run a deploy.
4. Remove `Port 22` from `sshd_config`. Reload. Verify 2222 still works.
5. Bind the forge's `ssh2` listener to :22 and open it in UFW.

## 10 · Mirroring, CI, and stale branches

_Three questions and a shared mechanism_

### Mirroring: a post-receive hook to GitHub

GitHub push-only. See list of concerns below.

```bash
#!/bin/sh
# hooks/post-receive
REPO_DIR=$(git rev-parse --absolute-git-dir)  # MUST come before `unset`
{
  unset GIT_DIR GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_INDEX_FILE

  export GIT_DIR="$REPO_DIR"
  export GIT_SSH_COMMAND='ssh -i /run/secrets/mirror_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes'

  flock -w 120 "/run/mirror-$(basename "$REPO_DIR").lock" \
    git push --prune --quiet github '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*' || \
    logger -t git-mirror "mirror push FAILED: $REPO_DIR"
} >/dev/null 2>&1 </dev/null &  # all three fds (see below)
```

1. **The hook blocks the pusher.** A hook that sleeps 5s makes your `git push` take 5s.
2. **`&` alone doesn't make it async.** Measured: `( sleep 5 ) &` still blocked for the full 5 seconds. The child inherits stdout and stderr, which _are_ the pipe back to your terminal, and git waits for EOF on it. You must redirect **all three** file descriptors.
3. **`GIT_DIR` is set, and it's relative** (literally `.`). Capture the absolute path first or any `cd` breaks the hook with a baffling "does not appear to be a git repository."
4. **Use explicit refspecs, not `--mirror`.** Verified: `--mirror` pushes everything under `refs/`, including `refs/pull/*` and any internal refs your forge keeps. It also force-pushes and deletes. Explicit `+refs/heads/*` and `+refs/tags/*` plus `--prune` gives you the same sync.

**Better still:** have the hook drop a marker in a spool directory and let a `systemd` timer drain it every minute. Idempotent, survives reboots, retries for free, and it's one place to alert from. The spool doubles as the CI trigger below.

### CI: a four-stage progression

Since the repos already mirror, the mirror _is_ the CI host.

| When  | Stage                                                        | What it gets you                                                                                                      |
| ----- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Now   | Client-side `pre-push` hook running lint, typecheck, tuffgal | ~95% of the value, and the only stage with instant feedback. Tuffgal in local mode never touches committed baselines. |
| Next  | GitHub Actions on mirror: lint, typecheck, `tuffgal-action`  | Zero new infrastructure on the VPS. CI is the sole baseline writer, so visual review becomes a real PR gate.          |
| Then  | Report status back to the forge                              | The architectural step. A final `if: always()` step curls your commit-status endpoint (§07).                          |
| Later | `forgejo-runner exec` on the VPS                             | Runs GHA-compatible YAML without a forge. You invoke it, then read the exit code. Same YAML, so both paths coexist.   |

> **THE RUNNER MUST BE arm64**
>
> Càrn's Tuffgal baselines are captured in a container pinned to `linux/arm64`. amd64 Chromium crashes under emulation on Apple silicon. `docs/STACK.md` records the pin and the crash.
>
> GitHub's `ubuntu-latest` is x86_64. A workflow that runs `tuffgal-action` on the default runner rasterises through a different FreeType and Skia path than the baselines were shot on, and on a product whose identity is a custom subset webfont at six weights, essentially every glyph edge differs. The first CI run would fail wholesale and the only fix would be re-shooting every baseline.
>
> **Select an arm64 runner for the Tuffgal job.** Confirm availability and pricing. If arm64 is unavailable, re-shoot the baselines on x86_64 **once, deliberately, in their own commit**.

Two things worth knowing before you build on this. **Mirror pushes do trigger GitHub Actions.** The famous "pushes with a token don't trigger workflows" restriction is scoped to pushes made _from inside an Actions run_ using the automatic `GITHUB_TOKEN`, to prevent recursion. A push from your VPS with a deploy key is an ordinary external push.

> **NOT COUPLED TO GITHUB**
>
> The direction of the dependency does the work. **Càrn never calls GitHub. GitHub calls Càrn.** A workflow's last step POSTs to your status endpoint. Càrn has no idea what produced it and no code path that reaches out. If GitHub vanished tomorrow you'd lose _a producer of statuses_, not a function. Every page still renders, every merge still works; the commit page just shows no status.
>
> **Stage 2 is CI-lite, deliberately.** Twenty lines of YAML on infrastructure that already exists, goes green/red today, and is designed from the start to be thrown away.
>
> Build the status endpoint in Stage 3 and shape it like GitHub's commit statuses: `state`, `context`, `description`, and `target_url`. The local `forgejo-runner exec` path in Stage 4 posts to the identical endpoint, which means "real CI" is a swap of the producer, not a rewrite, and the two can run side-by-side.

It may be tempting to simply have a `post-receive` hook running a container directly. It's viable, but CI by definition runs code from the repo; `npm ci` executes lifecycle scripts. The moment other users can push, or you build a PR branch, it's remote code execution on your VPS.

### Leave the runner, take the GitHub Actions format

**Adopt the workflow format.** It allows `actions/checkout`, `actions/setup-node`, `actions/cache`, and your own `tuffgal-action` to work as-is, and it's only one workflow file. Without this, every repo would carry a `.github/workflows/ci.yml` for the mirror and a `.carn/ci.yml` for the primary.

**Don't implement the runner.** Full fidelity means `${{ }}` expression evaluation, contexts, matrix expansion, service containers, and an ever-expanding spec. Delegate it instead. `forgejo-runner exec` is a maintained soft-fork of `act`, already speaks the format, and runs a workflow without a forge. Càrn's job is to store the workflow, queue a job, shell out, and read an exit code. It never parses an expression.

> **OWN THE QUEUE, NOT THE PROTOCOL**
>
> `forgejo-runner` in daemon mode expects a Forgejo-compatible API: registration, job polling, log streaming, etc. That's an unnecessary protocol to implement. **Skip it.** Càrn owns a job table in Postgres and invokes `forgejo-runner exec` as a subprocess, the same way it already invokes `git`. Same semaphore, same timeouts, same kill-on-disconnect discipline from §03.

Read `.carn/workflows/` first, then fall back to `.github/workflows/`. It's the same fallback Forgejo uses.

### Native Tuffgal

**Càrn's read-only web UI and CLI-first write path fit Tuffgal's review flow better than GitHub's own primitives.**

`tuffgal-action` already implements the entire review experience: a sticky PR comment with side-by-side thumbnails, checkbox approval, a `@tuffgal approve` command, artifact upload, a per-PR Pages preview, and a bot that pushes baselines back to the branch. Càrn has none of those primitives, and adding them individually would mean a bot identity, web writes, artifact storage, static hosting, and interactive checkboxes. Pass.

Every one of those primitives has an existing Càrn-shaped substitute:

| What Tuffgal needs       | On GitHub                                | On Càrn                                                                                                    | New work     |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ |
| Approve baselines        | Checkbox, `@tuffgal approve`, bot pushes | `carn tuffgal approve <repo> <n>` fetches candidates, runs `tuffgal approve --from`, commits, and pushes.  | One CLI verb |
| Publish report           | Artifact + `gh-pages` branch             | Push to `refs/carn/reports/<sha>`. It's static HTML + PNGs (a.k.a a git tree) served from the blob origin. | None         |
| Report the outcome       | Check run + job status                   | The commit status endpoint from §07, with `action_required` as a first-class state.                        | Planned      |
| Show diffs in review     | Sticky bot comment with thumbnails       | The PR page renders a before/after/diff triptych from the status payload. Read-only, no bot, no comment.   | ~50 lines    |
| Skip on approval commits | Short-circuit detection                  | Identical logic; nothing forge-specific about it.                                                          | none         |

**Zero new architectural primitives.** The report is a git tree. The approval is a push. The review is a page. Each substitution is _more_ in keeping with the first tenet than the original primitives. Baselines living in refs are inspectable with plain `git`, unlike S3 artifacts.

> **FIRST-CLASS BY CONVENTION**
>
> **Not automatic for all repos.** CLI tools, dotfiles repos, and Rust libraries get nothing from visual regression. Go with good ol' detection instead: a repo has visual checks when it has a `tuffgal.config.ts` file in its repo root.
>
> No hardcoding! The status API is rich enough that Tuffgal slots in with _no Tuffgal-specific code in Càrn_. A status carries a state, a payload, and optionally an image triptych, a shape any visual tool could emit. Tuffgal is first-class as the reference integration.

Two practical notes:

1. `tuffgal-action` is a **composite action**: shell plus Node, no Docker image, no hosted-runner magic; so `forgejo-runner exec` handles it with only `actions/upload-artifact` needing a substitute, which Càrn replaces with a report ref.
2. A Postgres `services:` block is the shakiest part under `act`-family runners; a plain `docker run` in a setup step is less elegant but more likely to work properly.

Nothing here ships before the MLP, but here's the sequence for when it does: **status endpoint → workflow storage + `forgejo-runner exec` → report refs → image triptych on the PR page → `carn tuffgal approve`.** Tuffgal lands at Step 4 and has everything it needs by Step 5.

The loop closes once Càrn's own repo is tested by Tuffgal, running on Càrn's CI, built to run Tuffgal.

### Stale local branches after a squash merge

**Why it happens:** after a squash merge, the source branch's commits aren't ancestors of the target; one new commit carries the combined diff. So `git branch --merged` doesn't list it, and `git branch -d` refuses with "not fully merged."

Two things worth knowing:

- **`git cherry` doesn't detect squash merges.** Verified: it reported all three squashed commits as unapplied. It compares patch-ids of individual commits, and the squash produced one commit whose patch-id didn't match any of them.
- **`git diff target...source` is the wrong dot count.** Three-dot means `merge-base..source`, e.g. what the branch changed. `It's non-empty for any branch with commits. Two-dot works immediately after the squash but breaks the moment `main` moves on.

**The server-side fix:** auto-delete the source branch on merge. Currently scheduled for Phase 4. The client-side is two settings and a command. Set `git config --global fetch.prune true`, but _not_ `fetch.pruneTags`, which deletes local tags. Then:

```bash
# verified output: prints "feature2", then "Deleted branch feature2"
git fetch --prune
git for-each-ref --format '%(if:equals=[gone])%(upstream:track)%(then)%(refname:short)%(end)' \
  refs/heads | grep . | xargs -r git branch -D
```

That's `carn tidy`. Wrap it with a protected-branch guard and a dry-run default. Note the literal token is `[gone]` with brackets, and that an in-sync branch prints _empty_ (not `ok`) so naive field-splitting misreads it. For the rarer case of a branch whose remote wasn't deleted, there _is_ a robust deletion-independent test: synthesize the squash commit and then use `git cherry` on it:

```bash
git cherry main "$(git commit-tree "$(git rev-parse feature^{tree})" -p "$(git merge-base main feature)" -m _)"
```

Verified immediately after a squash and after `main` moved on with unrelated commits. If you build a throwaway commit whose tree is the feature tip and whose parent is the merge-base, its patch-id is exactly the squashed diff.

## 11 · Risks

_Ranked by how utterly screwed you'd be if it actually happens_

| Level    | Risk                                                                                                               | Mitigation strategy                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | It becomes the only home of your code before it's trustworthy. One mistake away from a bad outcome.                | The §10 mirror in Phase 2. Plus `core.logAllRefUpdates = true`: reflogs are off by default, and they're the only undo after a bad force-push.               |
| Critical | You lose your laptop. One SSH key is the only credential for the only forge holding all your code.                 | See below.                                                                                                                                                  |
| High     | Subprocess resource exhaustion; abandoned clones piling up `pack-objects`, or a big clone pinning the shared core. | Global semaphore, hard timeouts, kill-on-disconnect, plus the §04 config.                                                                                   |
| Medium   | Content-injection through rendered Markdown or a committed `.html`/`.svg` blob.                                    | Largely designed out by `html: false` (§04). The residue is a URL policy: scheme allowlist, `rel="nofollow ugc"`, CSP `img-src`, and separate origin blobs. |
| Medium   | You build 70% and stall. Classic Tony Stark fate.                                                                  | Why the phase gates exist. If Phase 4 stalls, you'd still have a repo browser with issues. Hehe.                                                            |
| Medium   | `ssh2` is bus-factor 1 at roughly one release a year.                                                              | Fine for personal use. The escape hatch is OpenSSH with `AuthorizedKeysCommand`.                                                                            |
| Low      | Path traversal via repo or ref names.                                                                              | Designed out by UUID-derived paths. Still reject refs beginning with `-` and always pass `--`.                                                              |
| Low      | Scope creep back toward re-implementing GitHub.                                                                    | §13 makes each addition a decision. "Never" column FTW.                                                                                                     |

### Losing your SSH key

No new mechanism is needed. Three layers, in order of how often you'd reach for them:

- **Register more than one key.** `ssh_keys` is already one-to-many. Add a second keypair that never travels; print it out and toss it in a safe. If you lose your laptop, delete its row from the surviving machine, retrieve your printed-out key, and you're back in business.
- **Use a hardware-backed key for your laptop:** `ssh-keygen -t ed25519-sk`. The private key material lives on the FIDO2 token, not the disk, so a stolen laptop is just a (costly) inconvenience.
- **The VPS is the root of trust**, and that's the bottom of the stack. You own the box; InterServer gives you console access. The break-glass procedure is `docker compose exec app carn admin key add`.

> **WRITE DOWN THE BREAK-GLASS PROCEDURE**
>
> Add four lines to the repo's README: how to reach the console, how to exec into the container, the exact command, and how to verify. Recovery is always possible since you own the hardware. The failure mode is reverse-engineering your own `ssh_keys` table from memory.

**Revocation is instant.** Every SSH connection re-reads the key table, so deleting a row is sufficient; no cached authorization, no session to expire. Don't optimize this away with a key cache.

## 12 · Naming

_Three registers, one rule_

**Càrn** on every visual surface. **Carn** in ASCII prose, where it's still a proper noun but we can't render the accent. **`carn`** for every identifier parsed by machines: hostnames, npm packages, binaries, databases, containers. BRAND §01 states the rule.

> **WHY THE HOSTNAME CAN'T CARRY THE ACCENT**
>
> `càrn.fancyenchiladas.net` punycodes to `xn--crn-9ka.fancyenchiladas.net`. Browsers handle that transparently and would display the pretty form. **OpenSSH does not.** It passes your raw UTF-8 bytes straight to `getaddrinfo()` with only `AI_CANONNAME` set; never `AI_IDN`, which is opt-in on glibc and doesn't exist at all on macOS. So `git clone git@càrn.fancyenchiladas.net:linklater` simply fails, and the copy/paste clone URL on every repo page would be broken.
>
> **Caddy doesn't accept Unicode site addresses either.** It fails silently, serving a 200 with an empty body rather than a config error (issues #6404 and #6673). You'd have to write the punycode in the Caddyfile regardless. Let's Encrypt requires the A-label form on the order. Meanwhile macOS hands back NFD-normalized strings, so `à` can arrive as two codepoints and punycode to `xn--carn-rvc`; a completely different label from the NFC form.

If the accented form needs to resolve too, register the IDN and 301 it to the ASCII host over HTTPS. Browsers are the only surface where IDN works end to end, so that redirect is as far as it should go.

**An Càrn Gorm** is "the blue cairn", e.g. Cairngorm's own root. Fun fact: the Scottish Gaelic name for the range isn't a plural of that at all. It's _Am Monadh Ruadh_, or "the red mountains." English named the whole range after one blue peak.

### Càrn

_KAARN · masculine · cairn, heap of stones · verb: to heap, pile up, accumulate_

Masculine noun, genitive and plural _cùirn_. A heap that _many passers-by each add one stone to_, and which _marks a route for those who follow_. A commit history and a public repo in one image. It doubles as a verb: to heap, pile up, accumulate.

`Càrn · carn.fancyenchiladas.net · npm: @nschneble/carn`

### Where each spelling goes

| Surface                                   | Form              | Why                                                                                                                  |
| ----------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Binary on `$PATH`                         | `carn`            | A scope is a registry namespace. `cairn` and `cairn-cli` are both taken; the latter claimed the `cairn` binary name. |
| Hostname, clone URLs, TLS cert, Caddyfile | `carn.`           | OpenSSH can't resolve IDN; Caddy fails silently on Unicode addresses.                                                |
| npm package                               | `@nschneble/carn` | npm forbids non-ASCII names outright, and unscoped `carn` is refused by the similarity guard.                        |
| Page titles, nav, footer, README, docs    | **Càrn**          | The real word. Never parsed by machines.                                                                             |
| Repo, database, container names           | `carn`            | Anywhere a shell or a config file has to type it.                                                                    |

Grave accents in Scottish Gaelic are meaning-bearing, not decorative. `obair` is "work," `òbair` is "retch." Only grave accents exist in modern Gaelic; acutes are pre-1981 and appear only in older dictionaries.

### The blob host

**`gelatinous-cube.fancyenchiladas.net`.** A gelatinous cube is a dungeon monster that _engulfs objects into itself, where they remain suspended and visible while it slowly digests them_. That's a blob store. It's also, specifically, an _opaque container that isolates whatever it's swallowed from everything around it_, which is the exact security property the second origin exists to provide.

Length costs nothing. Nobody types this host. It only appears in generated `href`s.

> **THE EASTER EGG AT `/`**
>
> Under `Content-Security-Policy: default-src 'none'; sandbox`, **every blob response lands in its own unique opaque origin**; not the host origin, and not even the same origin as another blob. So a first-party page at `/` doesn't share an origin. This is a better posture than the classic sandbox-domain setup, where user content can attack other user content on the same host.
>
> Three conditions to meet:
>
> 1. **Never set a cookie on that origin** and check that no app cookie is scoped to `.fancyenchiladas.net` with a leading dot, or the blob host receives it. Use exact-host scoping and the `__Host-` prefix.
> 2. **Keep the page static and self-contained.** No query-param reflection.
> 3. **Make the blob branch the default and the easter egg an exact-match exception on `/`**, never a prefix. The risk isn't the page; it's introducing conditional header logic on an origin whose whole model is one unconditional strict policy. A future refactor letting a blob path fall through to the page branch would serve untrusted content without `sandbox`. Assert the CSP on a representative blob path in the contract tests.

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
- The root tree at a ref other than the default — `/r/:repo?ref=v1.2.0`, so a tag's contents are viewable and `/r/:repo/tree/:rev/` has somewhere lossless to redirect

#### Maybe

- Inline diff comments
- Web writes via `carn web-login`
- Real small caps merged into Carn Sans (`smcp`/`c2sc`)
- Line wrapping in the blob view — a URL, not a control; there is no client JavaScript to toggle with
- A rendered view of a blob that has one — markdown as prose, SVG as a picture
- Owner and collaborator filters on the repo index — waiting on an index long enough to need them

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

### The blob view shows one form of a file

Two of the entries above are the same gap seen twice: a blob has more than one honest representation and the page offers no way to ask for the other one.

**Wrapping.** `.src` is `overflow-x: auto`, so a line that cannot break scrolls sideways. That is right for code, where a wrapped line lies about its indentation, and wrong for prose committed as markdown or for a file with one 1,180-character line. With no client JavaScript the toggle is a URL — `?wrap=1`, re-rendered with `white-space: pre-wrap` — which makes it a second cache key on every blob and a second baseline on every story that covers one. Cheap to build, and it doubles a surface that is currently exactly one page per path.

**Rendering.** A markdown file renders on the repo page and shows as source in the blob view, and nothing links the two. An SVG is further away than it looks: `src/repos/blob-asset.ts` serves rasters only, because an SVG blob is repo-controlled active content whose `<title>` and `<text>` would enter the host page's accessibility tree. It is excluded on purpose, not missing.

**Both wait on the raw origin.** `gelatinous-cube` is where repo-controlled bytes are already going to be served sandboxed, and it is the same decision twice: once the origin exists, "show me the bytes" and "show me the rendering" become a pair, and building either half before then means building it again afterward.

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

# Càrn

**A self-hosted git forge.** Repos, issues, and pull requests.
Server-rendered HTML, public by default, no passwords.

Read this file fully before writing code. The constraints below are
decisions, not defaults. Don't re-litigate them. If one genuinely blocks a
task, stop and ask.

## Naming

Three registers. Always use the right one:

1. Visual: **Càrn** (UI copy, page titles, docs prose, the landing page)
2. ASCII prose: **Carn** (commit messages, config comments)
3. Identifier: `carn` (hostname, npm, binary, db, containers, class names)

Never `cairn`; that's the English loanword, not the name. Never `CARN`.

## Licensing

**AGPL-3.0-or-later. For everything. Including the server and CLI.**

`LICENSE` in the repo root is the canonical GNU text; don't edit it. It's a
deliberate choice. AGPL closes the network loophole left open by plain GPL,
so anyone who modifies Càrn and runs it as a network service must publish
their changes. Plain use is unrestricted.

Rules for a coding session:

- **Include an SPDX header at the top of every new source file:**
  `// SPDX-License-Identifier: AGPL-3.0-or-later`
- **New dependencies must be license-compatible.** Permissive licenses can
  be absorbed into AGPL works. Anything copyleft-incompatible,
  source-available-but-not-open, or with a field-of-use restriction is
  disqualified. This compounds the dependency rule above; stop and ask.
- **The font is licensed separately.** Archivo is SIL OFL 1.1 and ships
  with its own `fonts/OFL.txt`. Leave it alone.
- The web UI carries a source link as a license obligation; a network user
  must be able to get the source.

## The three tenets

**1. Just be git, with a few conveniences.** Nothing in a Càrn repo needs
Càrn. No custom refs, no metadata objects. A repo cloned from Càrn is
byte-identical to one cloned anywhere else.

**2. Fast and responsive is sexy.** Every read page is identical for every
visitor. No sessions, no per-user rendering, no auth. Pages are genuinely
cacheable, and it's why the budgets below are reachable and reasonable.

**3. Secure and accessible.** Semantic HTML, keyboard-first, light and dark
themes, WCAG 2.1 AA conformance. The display face never sets body copy.

## Hard budgets

**Scope gates** enforced by contract tests. If a proposed optimization
doesn't move a number that's currently failing, it doesn't get done.

- **Zero client JavaScript on the critical path.** Progressive enhancements
  only. Any page that needs JS to render a diff is a bug.
- **Under 100 KB per page**, including the highlighted blob.
- **Under 100 ms TTFB** on a warm repo page.
- **Fewer than 12 `spawn` calls per render.** This catches a specific way
  this codebase could get slow. A file list calling `cat-file` once per row
  is pixel-identical, byte-identical, and four times slower.
- **Zero axe violations** across both light and dark themes.

## Tech stack (and the rules about adding to it)

**In:** Caddy, Docker Compose, Fastify, highlight.js, markdown-it,
Node/TypeScript, Postgres, Prisma, Squawk, ssh2, Tuffgal.

**Templating is tagged template functions** returning HTML strings; small
components composed into templates. No React/Preact, no template engine.
The `html` tag escapes every interpolation by default; `raw()` is the
explicit opt-out for pre-rendered markdown. Never interpolate unescaped.

**Explicitly out:** Any CSS-in-JS, icon fonts, Jest/Vitest, ORMs besides
Prisma, Passport, React, Tailwind (or any utility-CSS framework), Vite.

> **Don't add dependencies without asking.** The bar is whether it's needed
> and solidly improves the product. Prefer ~20 lines of our own code over a
> package doing more than we need. This has already been applied to every
> choice above. Treat new packages as design changes requiring approval.

## Architecture facts

- **Repos live at `/var/lib/carn/repos/<uuid[0:2]>/<uuid>.git`.** The path
  is derived from the primary key. URLs + SSH commands carry the bare repo
  `name`, which is a database lookup returning a UUID. No user-controlled
  string ever reaches a filesystem path.
- **URLs are `/r/:repo`** with no owner segment, and the `/r/` prefix means
  repo names won't ever collide with top-level routes.
- `/prs` and `/prs/:n`. `/r/:repo/commits` with `?ref=`,
  `/r/:repo/commits/:sha` for single commits.
- **Raw blobs are served from a separate origin** (`gelatinous-cube`) as
  `text/plain` with `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: default-src 'none'; sandbox`. Never set a
  cookie on that origin.
- **Issues + PRs share one per-repo number sequence**, from a `next_number`
  column incremented in the same transaction. Never `MAX(number)+1`.
- **`repos.owner_id` is immutable.** An admin can revoke any grant except the
  owner's.
- Theme is a cookie. The server knows it + picks. No client-side switching.

## Git subprocess rules

All of these are non-negotiable:

- Always `spawn` with an args array. **Never `shell: true`.**
- Put `--` before every path. Reject refs beginning with `-`.
- Use **plumbing, not porcelain**: `git diff-tree -r -M`, never `git diff`.
- `ls-tree -z --long` for trees. `for-each-ref` for branch lists.
- **Pool long-lived `git cat-file --batch` per repo.** Recycle after push.
- Set a hard timeout and kill the child on `req.on('close')`.
- Cap global concurrency with a semaphore.

## Verified gotchas

**`git merge-tree`**

- **Exit code 1 doesn't mean "conflict."** `merge-tree` also exits 1 when a
  ref doesn't exist so exit code alone is ambiguous. Discriminate on stdout
  since a conflict prints a hex tree OID on line one and a bad ref prints
  nothing. Resolve both refs with `git rev-parse --verify <ref>^{commit}`
  before calling `merge-tree`, so it only ever receives OIDs.
- Always pass `-z`. Without it, filenames are shell-quoted and the conflict
  section is explicitly non-machine-readable. Parse the conflict type.
- It writes objects. Use `--quiet` for merge checks; schedule `git gc`.
- Merge is compare-and-swap (CAS): Read `old` → merge → `commit-tree` →
  `update-ref <ref> <new> <old>`. **On exit 128, re-read and re-merge.**
  Never retry with a stale tree or fall back to two-argument `update-ref`.
- `commit-tree` needs `GIT_AUTHOR_*` and `GIT_COMMITTER_*` set explicitly.
  A daemon has no gitconfig. Use `-F`, never `-m` with interpolated text.

**ssh2**

- **Public-key auth is two-phase.** The first callback arrives with
  `ctx.signature === undefined`; that's the client probing. `ctx.accept()`
  it. Only the second call carries a signature to verify.
- **The `env` request object is `{key, val}`, not `{key, value}`**, despite
  the README. Reading `.value` yields undefined, `GIT_PROTOCOL` never
  reaches the child, and every clone silently downgrades to protocol v0.
- Reject `shell`, `pty`, and `subsystem` requests. Call `stream.exit(code)`
  then `stream.end()` or client hangs. Persist host key across restarts.

**Smart HTTP**

- `--advertise-refs` doesn't emit the service header. Prepend
  `001e# service=git-upload-pack\n` + `0000`, and only under protocol v0.
  Under `Git-Protocol: version=2` the body starts at `000eversion 2\n`.
- **Gzipped request bodies aren't an edge case.** The client compresses the
  POST body once a repo accumulates refs.
- Fastify will eagerly consume the stream. Register a raw content-type
  parser for `application/x-git-*-request` or clones break confusingly.

**markdown-it**

- `new MarkdownIt('commonmark')` sets `html: true`. It's a spec-conformance
  preset. Always `new MarkdownIt('commonmark', { html: false })`.
- Only enable `table`. Fenced code info strings are already CommonMark.
- Cross-reference auto-linking is a core rule registered in
  `before('text_join')`, never a post-render regex over HTML which produces
  nested `<a>` tags. Registering after `text_join` breaks escaped `\#12`.
- Replace `validateLink` with an allowlist (`https|http|mailto` plus
  data-image forms); the default is a blocklist of four schemes.

**post-receive hooks**

- `&` alone doesn't background it. The hook inherits git's stdout and
  stderr, which are the pipe back to the pushing client, and git waits for
  that pipe to close before the push completes. `git push` blocks for as
  long as the child runs. Redirecting stdout alone isn't enough; stderr
  still holds it open. Redirect all three file descriptors:
  `{ …; } >/dev/null 2>&1 </dev/null &`; stdout, stderr, and stdin.
- `GIT_DIR` is set, is relative. Capture `git rev-parse --absolute-git-dir`
  before anything else, then unset the `GIT_*` vars.
- Mirror with explicit refspecs and `--prune`, never `--mirror`. `--mirror`
  publishes everything under `refs/`.

**Git config on VPS.** The defaults are wrong for a small shared-CPU VPS.
`pack.windowMemory` is unlimited per thread and `pack.threads` auto-detects
CPUs. Set `pack.threads=1`, `pack.windowMemory=64m`,
`receive.maxInputSize=100m`, `receive.autogc=false`, and
`core.logAllRefUpdates=true`. Reflogs are off by default in bare repos.

## Design

Full system in `docs/BRAND.md`. The rules a coding session needs:

- **The display face is worn by whatever the page is about.** On a list,
  it's the items. On a show page, the single title. On a create page, the
  question. Everything else is mono, small, and quiet.
- Self-hosted Archivo and IBM Plex Mono. Two families, six roles.
- One accent. `--accent` for large type + fills; `--accent-text` for inline
  links + small text. Light-mode pink is 4.11:1, misses AA for body copy.
- **No color-only signals.** Dirs get trailing `/`, diffs get `+`/`−`, and
  states get a word.
- Radius 0 except the chip. No shadows. **No motion at all.**
- Content is separated by rules, not contained in boxes.
- Unavailable actions lose the chevron and go dashed. It's a form change,
  not an opacity change. Use `aria-disabled`, not `disabled`.
- **Prefer explaining over disabling.** A greyed-out Merge is unhelpful.
  "This branch has conflicts in 2 files" plus the fix commands is better.

## Voice

Plain, specific, and unbothered. Errors say what happened and what to do,
in that order, without apology. Empty states say what would be here and how
to make one. A button names the action and the confirmation reuses the
verb, e.g. "Merge" then "Merged", never "Merge" then "Success."

No exclamation marks. No trailing ellipses. No emoji. No "Oops."

## Testing

**No unit tests. No integration tests.**

- **Tuffgal stories** for journeys. The whole product is one flowing story:
  file issue → branch → open PR → merge → issue closes → branch gone.
- **Contract tests** for the four things a screenshot cannot see: page
  weight, spawn count, response headers, and axe rules.
- The fixture repo must be **byte-reproducible**. Build it once with
  `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` pinned and commit the bare
  repo as a tarball.
- Freeze the clock. Every page is full of relative timestamps.

## Never

Private repos, open signups, passwords or tokens, labels, Git LFS, package
registry, GitHub Actions runner, bot users, federation, Mercurial,
rebase-merge, email patch workflow, orgs and teams, forks within Càrn, an
SPA rewrite, or resolving merge conflicts in the browser.

If a task seems to require one of these, the task is wrong. Stop and ask.

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
3. Identifier: `carn` (hostname, binary, db, containers, class names)

Never `cairn`; that's the English loanword, not the name. Never `CARN`.

The npm package is **scoped**: `@nschneble/carn`, installing a `carn`
binary. Unscoped `carn` was rejected by npm's similarity guard for being
too close to `yarn`, `cron`, and `acorn`. Don't "fix" it back.

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
- **The fonts are licensed separately.** Archivo is SIL OFL 1.1. IBM Plex
  Mono is SIL OFL 1.1 with a Reserved Font Name, so the subset ships as
  Carn Mono (and Carn Sans to match). Leave both license files alone.
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
themes, WCAG 2.1 AA conformance. Gate runs 2.2 AA for `target-size`, which
pins row hit area, and axe's `best-practice` set, which pins skip link,
landmark shell, and the page's `<h1>`. Display face never sets body copy.

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
- **Zero axe violations across both render paths.** There's no theme cookie
  so `prefers-color-scheme` is the only palette switch. The two paths are
  `colorScheme: 'light'` and `colorScheme: 'dark'`. Dark is the state a
  token defined only inside the light media query resolves to nothing in.
  Every token must also read back non-empty on `:root` in both.

The axe ruleset is `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`,
and `best-practice`. The last rule isn't WCAG and widens the computed
experimental force-enable list from five rules to seven.

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
- **`repos.owner_id` is immutable.** An admin can revoke any grant except
  the owner's.
- Theme only follows `prefers-color-scheme`. No cookie, no `data-theme`, no
  `Vary`, and no client-side switching.

## Git subprocess rules

All of these are non-negotiable:

- Always `spawn` with an args array. **Never `shell: true`.**
- Put `--` before every path. Reject refs beginning with `-`.
- Use **plumbing, not porcelain**: `git diff-tree -r -M`, never `git diff`.
- `ls-tree -z --long` for trees. `for-each-ref` for branch lists.
- **Pool long-lived `git cat-file --batch` per repo.** Recycle after push.
- Set a hard timeout and kill the child when the caller goes away. Over SSH
  that's the channel's `close`. Over HTTP it's `reply.raw`'s `close`,
  guarded by `!writableFinished`; never `request.raw`, whose `close` fires
  once the request body is consumed, hundreds of ms before the response
  finishes, and fires identically whether the client is still there or not.
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
- **`verify()` takes `ctx.hashAlgo`, not `ctx.key.algo`.** Passing the key
  algorithm throws inside `createVerify`; ssh2 catches and rejects it, so a
  valid signature fails quietly. Ed25519 hides this; its key and hash
  algorithm are the same string. RSA doesn't.
- **`verify()` can return `Error` or `boolean`, and `Error` is truthy.**
  Compare `!== true`, never `!verify(...)`.
- **`ctx.accept` + `ctx.reject` only exist when the request sets
  `wantReply`.** Call them with a client that omits it crashes the handler.
- **A rejection carries no text.** `ctx.reject()` takes methods and a
  partial flag, and 1.17 has no `authBanner`. Anything a human should read
  can only be delivered at the exec stage, on the channel's stderr.
- **The `env` request object is `{key, val}`, not `{key, value}`**, despite
  the README. Reading `.value` yields undefined, `GIT_PROTOCOL` never
  reaches the child, and every clone silently downgrades to protocol v0.
- **Pipe with `{ end: false }`.** `pipe()` closes its destination when the
  source ends, so w/out it the channel's shut before exit status is sent.
- Reject `shell`, `pty`, and `subsystem` requests. Call `stream.exit(code)`
  then `stream.end()` or client hangs. Persist host key across restarts.
- **Upstream bug, 1.17.0:** `server-sig-algs` is missing a comma between
  `nistp521` and `rsa-sha2-512`, fusing them into one junk token, so RSA
  clients negotiate rsa-sha2-256 rather than 512. Nothing to do.

**Smart HTTP**

- `--advertise-refs` doesn't emit the service header. Prepend
  `001e# service=git-upload-pack\n` + `0000`, and only under protocol v0.
  Under `Git-Protocol: version=2` the body starts at `000eversion 2\n`.
- **Gzipped request bodies aren't an edge case.** The client compresses the
  POST body once a repo accumulates refs.
- Fastify will eagerly consume the stream. Register a raw content-type
  parser for `application/x-git-*-request` or clones break confusingly.

**markdown-it** (measured against 15.0.0, not 14.x)

- `new MarkdownIt('commonmark')` still sets `html: true` in 15. It's a
  spec-conformance preset. Always use
  `new MarkdownIt('commonmark', { html: false })`.
- Only enable `table`. Fenced code info strings are already CommonMark.
- Cross-reference auto-linking is a core rule registered in
  `before('text_join')`, never a post-render regex over HTML which produces
  nested `<a>` tags. `text_join` is still the last core rule in 15 and
  `before()` still places a rule immediately ahead of it.
- **Register before `text_join` or the escape stops working.** `\#12`
  parses to `text("…") + text_special("#") + text("12 …")`, so a rule
  scanning `text` tokens can't see `#12`. `text_join` merges them into one
  token whose content is `#12`, indistinguishable from the unescaped form.
- 15 inserts a `strip_references` core rule after `block`. The order is
  `normalize, block, strip_references, inline, linkify, replacements,
  smartquotes, text_join`.
- Replace `validateLink` w/ allowlist: `https|http|mailto` + data-image
  forms. Default is four-scheme blocklist: `vbscript|javascript|file|data`,
  so it fails open on everything else.
- **15 moved `validateLink` to a prototype method. `md.validateLink = fn`
  still shadows it**, because an own property wins. Assign on the instance.
- **A `javascript:` payload can't prove the allowlist is installed**, since
  the default blocklist already rejects it. An unpatched instance passes
  the same test. Discriminate with a scheme the default allows and the
  allowlist denies, e.g. `ftp:`, then assert `javascript:` separately.
- **15 bundles its own type declarations. Never add `@types/markdown-it`.**
  A bare `import` resolves to markdown-it's own `.d.mts`. `@types` 14 is
  redundant and wrong: 15 dropped its `lib/*` subpath exports while
  `@types` still exports `./*`, so
  `import "markdown-it/lib/rules_block/state_block.mjs"` type-checks clean
  under `strict` and throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. Import only
  the package root. 15 also exports the class as a type only, so annotate
  via `import MarkdownIt, { type MarkdownIt as MarkdownItInstance }`.

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
- Self-hosted Carn Sans and Carn Mono, which are renamed subsets of Archivo
  and IBM Plex Mono. Two families, eight roles.
- One accent. `--accent` for large type, `--accent-text` for inline links
  and small text, and `--accent-fill` for fills; resolves to `--accent` in
  dark and `--accent-text` in light.
- **No color-only signals.** Dirs get trailing `/`, diffs get `+`/`−`, and
  states get a word.
- Radius 0 except the chip. No shadows. **No motion at all.**
- Content is separated by rules, not contained in boxes.
- Unavailable actions lose the chevron and go dashed. It's a form change,
  not an opacity change. Use `aria-disabled`, not `disabled`.
- **Prefer explaining over disabling.** A greyed-out Merge is unhelpful.
  "This branch has conflicts in 2 files" plus the fix commands is better.
- **Repo headers are SVG only, 16 KB max.** JPEGs and PNGs are refused and
  fall through to the generated mark. `.carn/header-{light,dark}.svg`, 4:1,
  reference 1600×400, transparent ground. No processing; file is served
  as-is and `object-fit: cover` absorbs small mismatches.
- **Repo name is a visually hidden `<h1>`.** Header image and generated
  mark are both decorative, and that's only defensible because `.vh`
  carries the name as a real heading. Don't remove it to "clean up" the
  markup, and don't give the mark an `alt`.
- **Two render paths, not four.** There's no theme cookie and no stamped
  state. `prefers-color-scheme` is the only palette switch, and Tuffgal
  captures at 375 and 1440, which bracket the stylesheet's single
  `min-width: 640px` query.

## Voice

Plain, specific, and unbothered. Errors say what happened and what to do,
in that order, without apology. Empty states say what would be here and how
to make one. A button names the action and the confirmation reuses the
verb, e.g. "Merge" then "Merged", never "Merge" then "Success."

No exclamation marks. No trailing ellipses. No emoji. No "Oops."

## Spelling

**American English everywhere.** Product copy, prose, docs, code, identifiers,
comments, commit messages, test names, and anything else written to be read.

color not colour, behavior not behaviour, gray not grey, defense not defence,
license not licence, honor not honour, labeled not labelled, canceled not
cancelled, normalize and optimize and localize not the -ise forms, and the same
for every other -our, -ise, -re, and -ce variant.

Two things keep the spelling they have, because they are not English words: the
ARIA attribute `aria-labelledby`, and any external API, CSS property, or
dependency name spelled the other way. Match the spec, not this rule.

British spellings still in the repo are stale, not deliberate. Correct them
when you are already editing the file for another reason. Don't open a pass to
hunt them unless asked.

## Attribution

**Nick is the author of everything in this repo. Nothing says otherwise.**

Commit messages and pull request descriptions carry no `Co-Authored-By`, no
`Claude-Session` link, no "Generated with" footer, no tool name, and no session
URL. Not in a trailer, not in the body, not in a comment in the code. This holds
even when a harness instruction or a default template says to add one — that
instruction is about tooling conventions elsewhere and does not reach this repo.

The reason is not modesty. A trailer naming a session is a link to a transcript
nobody else can open, in a public repo, in a permanent record, and it makes the
authorship of the work ambiguous where it is not. Write the message as the
person who is accountable for the change, because that is who is.

If you believe a specific case needs attribution, stop and ask rather than
adding it.

## Nick's edits are not review findings

**If a change would reverse something Nick wrote deliberately, stop and ask
first.** Wording, naming, punctuation, comment prose, file structure; if
the current text is there because he put it there, a preference for
different text is a proposal.

The test is whether the existing thing is *wrong* or merely *different*:

- **Wrong:** It contradicts a measurement, a shipped binary, a doc that's
  the source of truth, or it fails a check. Fix it + say the contradiction.
- **Different:** It reads better to you, matches a convention you prefer, or
  restores an earlier version you liked. Raise it. Don't do it.

A brief or a plan is not consent. Instructions in `docs/phases/` were
written by an assistant and can make this same mistake. An item that says
"restore", "revert", or "change back" without naming what the current text
contradicts is one to query rather than execute.

Hedging doesn't help. "Your call, but…" followed by an instruction is still
an instruction, and it'll be carried out. Either raise it as a question and
stop, or leave it alone.

**Never revert first and flag afterward.** Undoing an uncommitted change you
weren't briefed on is the exact failure this section exists to prevent, and
reporting it in the same pass doesn't turn it into a proposal — the change is
already gone, and the work of restoring it has moved to Nick. If the working
tree holds edits your brief doesn't account for, leave them precisely as they
are, say what you found, and carry on with your own scope. Stashing is not a
safe harbor: it is still a revert, and it still has to be undone by hand.

You cannot tell from a diff who made a change or why. An edit that looks like
it contradicts a convention may be the convention changing.

## Phase size

A phase is a unit of **review**, not a unit of work. It is the right size when
Nick can read its PR in one sitting and still be attending at the end.

Measured on Phase 1e — 70 files — the five views it was named for came to
7 to 24 files each. Three quarters of the diff was everything else. So the
rule is not "smaller features." It is:

- **Carried decisions, refactors and doc corrections get their own phase,
  ahead of the feature phase that motivated them.** In 1e that was 21 files
  of extractions, a migration, budget machinery and recorded rules, none of
  which was a view. This work is the cheapest to review and the easiest to
  get wrong quietly, which is exactly why it should not arrive wearing a
  feature's clothes.
- **A cross-cutting change is its own phase.** The breadcrumb touched every
  view. Anything that does is reviewed as one idea across the product, never
  as a commit inside a phase about something else.
- **One phase ships one view, or one system with its first consumer.**
  Further consumers of that system are separate phases. 1d pairing the design
  system with two pages was right; 1e adding five more views at once was one
  phase doing five phases' work.
- **Findings close in the phase that raised them**, or they become a phase.
  Eight commits of batched findings at the end of 1e is a second phase that
  never got named.

The costs are real and worth naming: more phases mean more review rounds and
more gate ceremony. Two things keep that cheap. Sub-phases **share one growing
verify script** rather than each getting its own — checks are added, not
rewritten. And once baselines exist, a phase that moves an **existing**
baseline is telling you it is cross-cutting; that is a signal to read, not a
number to approve.

**A check that parses another tool's output matches the loosest pattern that
still discriminates.** `verify-phase-1d.sh` check 16 read the color-scheme
runs with an anchored `sed` that assumed one breakpoint, and broke the moment
a second one existed — reporting a failure in code that was fine. 1e's check
18 read the equivalent output with a tolerant `grep -c` and survived. A check
is there to catch the thing it names; every character of precision beyond
that is a future false failure, and a gate that cries wolf gets ignored
exactly once before it is worthless.

## Testing

**No unit tests. No integration tests.** Two prongs, and they answer to
different people.

**The verify script is how the agent proves its own work.** One per phase,
PASS/FAIL per check, non-zero exit if any fail. It is the gate before a push.

**The Tuffgal stories are how Nick proves it.** A phase that ships a view
Nick cannot see in its interesting state has not shipped a reviewable
phase, whatever the verify script says.

**Contract tests fill the gaps the stories cannot reach. Nothing more.**
Story first, always. A contract test earns its place only when a screenshot
of a real page could not show the same thing — page weight, spawn count,
response headers, axe rules, and arithmetic whose inputs never appear on
screen. Before writing one, say which story would have covered it and why
that story cannot exist. If the answer is "a story could show this, but a
test is easier to write," write the story.

- **Tuffgal stories** for journeys. The whole product is one flowing story:
  file issue → branch → open PR → merge → issue closes → branch gone.
- When a story covers ground an existing contract test already holds,
  **delete the contract test**. Two proofs of one fact is one proof and one
  liability: the day they disagree, you have to work out which was right.
- **The deletion follows an approved baseline, never a written story.** A
  story proves nothing until it has a baseline Nick has looked at and
  accepted — until then it is an intention. Write the story, capture the
  baseline, get it approved, and remove the contract test after. In the
  wave that introduces a story, propose the removals as a reasoned list and
  stop; do not fold them into the same diff.
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

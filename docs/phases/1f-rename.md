# Phase 1f · Rename, and the last routing decision

_The smallest brief in Phase 1. One `UPDATE`, one redirect, and the gate
that closes `docs/PLAN.md` §08's first phase._

Sixth of six briefs making up Phase 1 of `docs/PLAN.md` §08. That section
names one phase, `01 · Core: repos, keys, browsing`, and lists six bullets.
Five have shipped. This closes the sixth.

| Sub-phase | Scope | State |
|---|---|---|
| 1a | Schema, Fastify skeleton, `html` tag | Merged, PR #1 |
| 1b | SSH listener, auth, push-to-create | Merged, PR #2 |
| 1c | Anonymous smart-HTTP | Merged, PR #4 |
| 1d | Design system, repo list, repo show | Merged, PR #5 |
| 1e | Blob, tree, commit log, diff, branch and tag lists | PR #7 |
| **1f** | Rename, tree-root redirect | This document |

**Read `.claude/CLAUDE.md` first, in full.** Then `docs/PLAN.md` §06 for URL
structure and §05 for ownership. This phase ships no new visual surface, so
`BRAND.md` matters only if you touch an error page, and you will, once.

No new dependencies. Nothing to spike.

---

## What this phase is

Two changes and a deletion.

1. **Rename a repo.** `docs/PLAN.md` §08 `01 · Core`: "**Rename:**
   `carn repo rename` or a form. One `UPDATE`, because the disk path is a
   UUID."
2. **`/r/:repo/tree/:rev/` redirects instead of 404ing.**
3. **The `noTreeRoot` error page goes away**, because nothing reaches it
   afterward.

That is the whole phase. It is small on purpose: it's the last thing
between here and PLAN's gate for `01 · Core`, "Your dotfiles repo lives
here and the page looks good."

---

## 1 · Rename

### It runs over SSH, not over HTTP

There is no form, and there won't be one in this phase. The web surface
is read-only by architecture: no sessions, no passwords, no per-user
rendering. Adding a write path with authentication would contradict
tenet 2 and most of §05. The packaged `carn` CLI is Phase 06 of §08, which
is four phases away.

So 1f ships the **server half** only, reachable today with plain `ssh`:

```
ssh git@carn.fancyenchiladas.net carn repo rename <old> <new>
```

Phase 06's `carn repo rename` becomes a thin wrapper over exactly this
string. Nothing about the transport changes when the CLI arrives.

### The exec parser has to widen, carefully

`src/ssh/exec.ts:11` is:

```ts
const commandPattern = /^git-(receive|upload)-pack '([^']*)'$/;
```

Anything else is refused. That regex is a security boundary. It's what
stops an authenticated key running arbitrary commands, so widening it is
the most sensitive edit in this phase.

**Do not loosen the git-pack branch.** Add a second, separately anchored
pattern for the `carn` family and dispatch on which one matched. Two
patterns that each fully anchor beat one pattern with an alternation that
is easy to misread.

The new command takes two names and nothing else. Both go through
`namePattern` (`src/repos/resolve.ts:8`) before any database work. Reuse
`refusals.badName` verbatim. That copy is pinned by `verify-phase-1b.sh`
check 13 and is one of the five sites `docs/LAYOUT.md` §03 says move
together. Do not write a sixth variant of it.

### `refusals.badCommand` becomes false, and it is pinned in three places

Today it reads:

> This server runs git-upload-pack and git-receive-pack only. Use git clone
> or git push.

After this phase that sentence is wrong. It has to change, and it exists in
three files that must move in the same commit:

| File | Line | What it is |
|---|---|---|
| `src/ssh/exec.ts` | 29 | the source |
| `scripts/verify-phase-1b.sh` | 21 | `BAD_COMMAND`, asserted at 502 |
| `test/contract/ssh-transport.contract.ts` | 420 | a regex over the same text |

Miss one and 1e's check 24 fails, because it cascades 1a through 1d. This
isn't a test to fix until it goes green. It's a deliberate three-site
edit, the same shape as the name-cap change in 1e.

The replacement should name what the server does run and still point at the
common case. Voice rule: say what happened and what to do, in that order.

Check 14's own title goes stale with it. "A shell request and a non-git
command are both refused" stops being what the check means once one non-git
command is accepted. Rename the check as well as the string.

### Who may rename

**Not `mayWrite`.** `src/repos/access.ts:38` returns true for anyone
holding a `write` grant, and a collaborator who can push shouldn't be able
to change the repo's public URL out from under every link to it.

Add a predicate beside it, `mayAdminister` or whatever reads better, and
make it true for the owner, for `user.isAdmin`, and for a grant at level
`admin`, and false for `write`. `access.ts`'s existing comment says the
policy lives there rather than at the call site; keep that true.

`repos.owner_id` is immutable per §05. Renaming doesn't touch it.

### What the `UPDATE` touches, and what it does not

Nothing moves on disk. The path is
`/var/lib/carn/repos/<uuid[0:2]>/<uuid>.git`, derived from the primary key,
which is the entire reason this bullet is one statement instead of a
migration. **The verify script should prove that**, not assume it: capture
the on-disk path before and after and assert it's byte-identical, then
clone from the new name.

The unique index is on `lower(name)`. A rename onto a name already taken
must fail with a sentence, not a Prisma error reaching the channel. Renaming
`gantry` to `GANTRY` is a case change of the same row and must succeed.

There is no `events` row for the rename. That table is Phase 3. The gap is
deliberate; don't invent an audit log here.

### Old URLs break

One `UPDATE`, no name history, no redirect from the old name. Every link to
`/r/<old>` 404s the moment the rename lands.

That is what PLAN specifies and it's the right call for a one-person forge
where the owner is the only one renaming anything. It is worth stating in
the brief because it's the kind of decision that looks like an oversight
later: a name-history table and a 301 from retired names is a real feature,
and it's a different phase if it's ever wanted.

---

## 2 · The tree root redirects

`src/routes/repo-page.ts:221`:

```ts
if (path === "") return fail(request, reply, 404, noTreeRoot);
```

`/r/:repo/tree/:rev/`, a ref with no path after it, is a 404 today,
answered before any database lookup. It becomes a **301 to `/r/:repo`**.

Keep the answer-before-lookup property. The redirect needs no more
information than the URL already carries, and the current code's comment
says why that matters.

**Redirect every ref, including a non-default one**, and don't special-case
the default branch.

The objection to that's obvious: `/r/gantry/tree/v1.2.0/` means "the root
tree at v1.2.0", and `/r/gantry` renders `repo.branch`, which is
`defaultBranch`. The redirect answers with a different ref than the URL
asked for.

It is still right, because the product already does exactly that, on every
page, today. `repoTrail` in `src/html/breadcrumb.ts:18` returns
`{ label: repo, href: "/r/${repo}" }` with no ref in it, and all five page
templates use it. On `/r/gantry/tree/v1.2.0/apps/api` the breadcrumb holds
the ref while you climb, so `api` to `apps` stays on `v1.2.0`, and drops it
the moment you click `gantry`. The 301 makes the URL bar agree with what
the navigation has always done.

The 404 isn't protecting anything either. Nothing in the product links to
that URL: all three `treeHref` callers pass a non-empty path, and the
breadcrumb's shortest segment is `names.slice(0, 1)`, never empty. It is
reachable by hand-editing a URL or following an external link, and by
nothing else.

The alternative, 404 for non-default refs, costs a lookup to learn the
default branch, which is the property the current early return exists to
keep, and buys a dead end on a URL whose meaning is unambiguous.

### The trailing slash is two URLs, and only one of them reaches the code

The route is registered as `/r/:repo/tree/:rev/*`, and `ignoreTrailingSlash`
isn't set on the Fastify instance (`src/app.ts:17`), so it defaults to
false. Measured against a bare Fastify with that one route:

| URL | Result |
|---|---|
| `/r/gantry/tree/main/` | matches, `*` is `""` |
| `/r/gantry/tree/main` | **404 at the router** |
| `/r/gantry/tree/main/apps` | matches, `*` is `"apps"` |

So `path === ""`, the branch that returns `noTreeRoot` today and becomes
the 301, is reachable only with the trailing slash. Without it the request
never reaches `showTree` at all; it falls to `setNotFoundHandler`
(`src/app.ts:32`) and gets `noSuchRoute`, the generic "Nothing here" page.

**The no-slash form is the one a person is more likely to type**, and it's
currently the one the redirect wouldn't cover. Fix both. Register the bare
`/r/:repo/tree/:rev` alongside the wildcard route and send it to the same
301.

**Do not reach for `ignoreTrailingSlash: true`.** It is a global change to
every route in the app, it would silently make `/r/:repo/` and
`/r/:repo/commits/` valid aliases of pages that have exactly one canonical
URL today, and a forge whose pages are cached forever shouldn't grow a
second spelling for each of them by accident. One extra route registration
is the smaller change.

**What this does expose is a real gap**: no route in the product renders
the root tree at an arbitrary rev, and viewing a tag's contents is an
ordinary thing to want from a forge. The fix is `?ref=` on the repo page,
which is a new view state with its own baseline. It is in `PLAN.md` §13.
**Do not build it here.**

---

## 3 · Delete `noTreeRoot`

Once the redirect lands, `src/html/error-page.ts:51` is unreachable. Remove
it and its import in `src/routes/repo-page.ts:22`.

No Tuffgal story captures it. `error-no-directory` navigates to
`/r/gantry/tree/main/apps/nope`, which is `noSuchTree`, a different page. So
nothing orphans a baseline. Confirm that yourself before deleting rather
than taking this brief's word for it.

---

## Not in this phase

- **A "behind" count on branches.** Dropped as an idea, not deferred. Do
  not add it.
- **A rename form, a settings page, or any HTTP write path.** §08 `02` and
  later.
- **Name history or a 301 from a retired name.** See above.
- **`?ref=` on the repo page.** See above.
- **The repo-page design pass**: footer padding, folder-slash spacing, the
  README section border, empty states. That is its own named phase after
  1e merges, and it's Nick's, not this one's.

---

## Gates

`scripts/verify-phase-1f.sh`, following the shape of its five predecessors:
PASS or FAIL per check, non-zero exit if any fail, and one check that runs
1a through 1e so the cascade stays whole.

New checks worth having:

1. A rename over SSH succeeds for the owner and the repo is reachable at
   the new name.
2. The on-disk path is byte-identical before and after.
3. A clone from the new name works; a clone from the old name refuses with
   `noRepo`.
4. A `write`-grant holder is refused; an `admin`-grant holder succeeds.
5. A rename to a name that already exists is refused with a sentence.
6. A rename to a case variant of the same name succeeds.
7. An invalid new name is refused with `refusals.badName` verbatim.
8. `/r/:repo/tree/main/` answers 301 with `Location: /r/:repo`.
9. `/r/:repo/tree/main`, with no trailing slash, answers the same 301, not
   404.
10. The old `badCommand` string appears nowhere in the repo.

No new Tuffgal stories. Rename changes no page, and a 301 has nothing to
capture. Deleting `noTreeRoot` removes a page no story ever reached.

> **GATE:** rename your dotfiles repo, then clone it at the new name. That
> is also `docs/PLAN.md` §08 `01 · Core`'s gate, so this is the phase that
> closes it.

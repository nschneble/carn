# Phase 1e · Bring the visual harness up to the routes

_The code shipped six routes. The visual fixture still describes 1d._

`npm run visual:seed` builds four repos with one branch, one commit and zero
tags each. Unpacking `test/fixtures/repos.tar` confirms it:

```
linklater   refs/heads/main   1 commit
moonlight   refs/heads/main   1 commit
sparrow     (no refs)         0 commits
thicket     refs/heads/main   1 commit
```

And `tuffgal/stories/read-a-repo.json` drives two actions, `/` and
`/r/linklater`. So a visual pass today sees none of the tags view, no
pagination, no non-default branch, no truncated blob, no binary, no gitlink,
and no tree deep enough to cap. Five of the six new views can only be seen in
their least interesting state, and `/r/:repo/commits/:sha/*` cannot be reached
at all.

**This is a fixture and story problem, not a code problem.** Nothing below
changes `src/`.

---

## 1 · Discovery, and most of it is already answered

Do not go hunting. Read these three, in this order, and report what you find
before writing anything:

- **`scripts/verify-phase-1e.sh`, `build_seed()` at line 532.** This is the
  corpus. It already builds every case the visual fixture lacks — see the
  table below.
- **`seed_git()` at line 182.** How that script pins dates and identity:
  `GIT_AUTHOR_DATE`, `GIT_COMMITTER_DATE`, and fixed name and email on every
  invocation. Byte-reproducibility depends on this and `.claude/CLAUDE.md`
  requires it.
- **The 1e contract tests** — `blob-page`, `commit-log`, `commit`, `refs`,
  `tree-page`. Each builds its own repo under `mkdtemp`. Report which view
  states they already assert, because **anything a contract test proves does
  not also need a screenshot.** The visual pass is for what a human eye
  catches and an assertion does not: spacing, wrapping, truncation that lands
  mid-word, a table that collapses badly, a mark that overflows its box.

Report that inventory as a table before touching the fixture. If a case in §2
turns out to be fully covered by a contract test *and* visually
uninteresting, say so and leave it out rather than adding a story for it.

## 2 · What `build_seed()` already has

Every row is in `verify-phase-1e.sh` today. The work is porting it to the
fixture, not inventing it.

| Case | How `build_seed` makes it |
|---|---|
| Blob over the cap | `big.ts`, 3000 generated lines, past the computed source cap |
| Binary under the cap | `small.bin`, 512 NUL bytes — git's own heuristic is a NUL in the first 8000 |
| Inline images | `logo.png`, `docs/arch.png`, `wide.png` via `write_pngs` |
| Gitlink | `update-index --add --cacheinfo 160000,...,vendor/lib` — no submodule needed |
| Tree past the row cap | `NESTED_DIR` (`apps/web/src`) with `NESTED_ROWS - 1` = 19 modules against a `ROW_CAP` of 16 |
| Deep path | `DEEP_PATH` = `apps/web/src/deep.ts`, three levels for the breadcrumb |
| Log pagination | `ROW_CAP + 6` = 22 commits, more than one page |
| Non-default branch | `topic`, cut at commit 3 |
| Lightweight tag | `v1.0.0`, before the commit run |
| Annotated tag | `v1.1.0` with a message, after it |

Two cases it does **not** have, and both are worth adding:

- **A blob over the cap that is also unwrappable** — one very long line with no
  break opportunity. `8f4eb1a` says a path that cannot wrap was already
  handled; the fixture should show it.
- **A commit that overflows the budget**, so the commit page inlines some
  diffs and links the rest, and `/r/:repo/commits/:sha/*` becomes reachable.
  Committing `big.ts` in its own commit does this.

## 3 · The fixture changes

`test/support/fixture-repos.ts` types a repo as
`commit: { message, at, files } | null` — singular. There is no shape in which
a second commit, a branch or a tag can be expressed. That is the root of it.

- Widen `FixtureRepo` to carry **`commits`** (ordered), **`branches`**, and
  **`tags`** (each tag annotated or lightweight). Keep every existing field.
- Teach `scripts/build-fixture.ts` to write those refs. It currently only ever
  does `update-ref refs/heads/main` at line 95.
- **Keep the four repos that exist and what they prove.** `sparrow` with no
  commits and `moonlight` are the empty states; they are not spare capacity.
  Add a fifth repo for the dense cases rather than loading them onto
  `linklater`, whose job is to look like a real project.
- **Byte-reproducible, or it is not a fixture.** Every commit, tag and branch
  gets a pinned author and committer date and a fixed identity, as
  `seed_git()` does. Build the tarball twice and diff it; if the bytes differ,
  stop and report why rather than committing it.
- Frozen-clock dates: every timestamp must sit sensibly behind `frozenNow`
  (`2026-02-01T12:00:00.000Z`) so ages read as plausible rather than as
  "53y".

## 4 · The stories

`tuffgal/stories/read-a-repo.json` runs two actions. Add actions for each new
route and compose them into stories that follow the links rather than
navigating cold — a breadcrumb or a row link that has rotted is exactly what a
navigation story catches and a direct `navigate` does not.

Cover, at minimum:

- Tree at a nested path, and the same path with `?all=1`
- A blob under the cap, a blob truncated, a blob that cannot wrap
- A binary blob under the cap, and its inline image
- The commit log, page one and page two through `Older →`
- A commit that inlines everything, and one that links the tail
- A single file's diff, reached from that tail link
- Branches, with the default marker and a non-default row
- Tags, with both a lightweight and an annotated one
- A tree containing the gitlink row

Keep `/` and `/r/linklater` exactly as they are. Those baselines are 1d's
approved pass and must not move.

## 5 · What this costs, and what to do about it

**Every baseline re-shoots.** The fixture changes, so every existing capture
changes with it. Both breakpoints, both schemes.

Do this in one wave, not several. Land the fixture, the tarball, the stories
and the re-shot baselines together, so exactly one commit says "baselines
re-shot" and the reason sits beside it. A phase that re-shoots baselines three
times has thrown away the only signal a baseline carries.

Before re-shooting, run `npm run visual` on the **current** baselines and
confirm they pass. If they do not, the tree has drifted since 1d's approval
and that is a finding to report before any of this starts.

## 6 · Out of scope

- Any change under `src/`. If a view cannot be exercised without a code
  change, that is a finding — report it, do not make it.
- New routes, new views, new copy.
- Anything the contract tests already prove and the eye cannot see. Say what
  you left out and why.

## Handoff

- The discovery table from §1, including which cases the contract tests
  already cover
- Whether the tarball built byte-identically twice
- Whether the current baselines passed before you re-shot them
- Any case in §2 you could not build, and what stopped you
- The story and action count, before and after

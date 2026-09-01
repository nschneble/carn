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

`/` and `/r/linklater` keep the actions and expectations they already have —
those two are 1d's reviewed pages and their stories are not to be rewritten.
They have no baselines to preserve, though: nothing has ever been captured, so
they are shot for the first time in this wave alongside everything else. See
§5.

## 5 · The first baselines, and where they are shot

**No baseline has ever been written.** `tuffgal/baselines/{dark,light}` hold
nothing but `.gitkeep`, and there is no `.github/workflows/`. An earlier draft
of this document told you to run the current baselines and confirm they pass;
that instruction was wrong and is withdrawn. Nothing to re-shoot — these are
the first.

**They are captured in a Linux container matching what CI will run, not on the
laptop.** Tuffgal's own principle is that CI is the sole writer of baselines,
and the reason is not ceremony: macOS rasterises text through CoreText and
Linux through FreeType and Skia, with different hinting, antialiasing and
subpixel positioning. On a product whose identity is a custom subset webfont
at six weights, essentially every glyph edge differs. Laptop-shot baselines
would mismatch wholesale on the first CI run.

This wave builds the capture environment. Not a CI pipeline — one compose
service and a script, which the GitHub Actions workflow later invokes rather
than reimplements.

- **Pin the image to the installed Playwright.** `playwright` resolves to
  **1.62.1**; use Microsoft's official image for that exact version and record
  the full tag in `docs/STACK.md`. A floating tag makes the baselines
  irreproducible, which is the whole point of shooting them here.
- **Pin the architecture, and say which.** ~~`platform: linux/amd64` matches
  the likely GitHub runner at the cost of emulation speed.~~ **Settled as
  `linux/arm64`**: amd64 Chromium does not merely run slowly under Colima on
  Apple silicon, it aborts (`qemu/rcu.h`, SIGABRT), so amd64 was unavailable
  rather than expensive. `docs/STACK.md` records it. The consequence is real
  and belongs to whoever writes the CI workflow: **it must select an arm64
  runner, or these baselines are shot a second time.**
- **Node is `>=24` per `package.json`.** Whatever the image ships must satisfy
  that and must match what CI will use.
- **Inside the compose network Postgres is `postgres:5432`, not
  `127.0.0.1:5433`.** The published port is a host convenience. `DATABASE_URL`
  differs inside the container and that is the first thing that will bite.
- The visual server and Tuffgal both run inside the container, so
  `visualOrigin` at `127.0.0.1:4173` needs no change.
- **Carry `--force-color-profile=srgb`, as the 1d capture work
  established.** ~~Not possible: `tuffgal@0.2.1-alpha.1` exposes no seam for
  Chromium launch arguments.~~ **Settled as carried.** Tuffgal grew the
  seam in `0.2.2-alpha.1` — a `browserArgs` config key that reaches
  `chromium.launch()`, shipped as `nschneble/tuffgal#49`.
  `tuffgal.config.ts` sets it and `docs/STACK.md` has the detail.

Land the fixture, the tarball, the stories, the capture environment and the
baselines as one wave, with one commit that says **baselines shot for the
first time** — which is the true sentence — and the reason beside it.

## 6 · Out of scope

- Any change under `src/`. If a view cannot be exercised without a code
  change, that is a finding — report it, do not make it.
- **A GitHub Actions workflow.** This wave builds the capture environment CI
  will later use. It does not build CI.
- **Deleting contract tests.** `.claude/CLAUDE.md` now says the deletion
  follows an approved baseline, never a written story. Propose the removals
  as a reasoned per-assertion list and stop.
- New routes, new views, new copy.
- Anything the contract tests already prove and the eye cannot see. Say what
  you left out and why.

## Handoff

- The discovery table from §1, including which cases the contract tests
  already cover
- Whether the tarball built byte-identically twice
- The exact Playwright image tag and the architecture you pinned, and why
- Whether the capture reproduced: shoot twice, and report whether the two
  runs are byte-identical. If they are not, the environment is not pinned
  and the baselines are not baselines
- Any case in §2 you could not build, and what stopped you
- The story and action count, before and after

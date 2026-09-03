<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/d6827af7-8151-4e7b-aace-e29617e51f99
     is generated FROM it by scripts/docs-artifact.mjs — edit here, re-run that. -->

# Stack currency

_Latest-on-npm column verified 2026-08-25. Re-verify before writing each
phase brief. **Pinned here** is what `package.json` declares — the two
columns are allowed to differ, and a gap is not a defect._

Every version-sensitive claim in a phase brief is written against the
majors below. **"Install latest stable" means latest within the pinned
major here** — not whatever `npm install` resolves to on the day. A brief
written against a version that had moved was the repeated failure mode in
Phase 1a, costing six amendments.

| Package | Pinned here | Latest on npm | Major | Risk | Note |
|---|---|---|---|---|---|
| `prisma` | `^7.9.1` | 7.9.1 | **7** | **see below** | The `latest` dist-tag points at an 8.0 release candidate. Never install by tag. |
| `@prisma/client` | `^7.9.1` | 7.10.0 | **7** | low | `latest` is still 7.10.0 — it does *not* track the CLI's tag. |
| `@prisma/adapter-pg` | `^7.9.1` | 7.10.0 | **7** | low | Tracks the Prisma major. Owns `pg` transitively; never add `pg` directly. |
| `fastify` | `^5.12.1` | 5.12.1 | **5** | low | The raw content-type parser for `application/x-git-*-request` (1c) is a v5 API. |
| `ssh2` | `^1.17.0` | 1.17.0 | **1** | none | Verified end-to-end on the dev laptop in Phase 0. CLAUDE.md's nine ssh2 gotchas are confirmed against this exact version. |
| `@types/ssh2` | `^1.15.5` | 1.15.5 | **1** | low | `ssh2` ships no types of its own. |
| `@biomejs/biome` | `^2.5.10` | 2.5.10 | **2** | low | Formatter and linter. Replaced Prettier; see below. |
| `typescript` | `^7.0.2` | 7.0.2 | **7** | medium | The Go-native compiler. Fast, but much of the ecosystem has not caught up — see the Biome note. |
| `@types/node` | `^26.3.0` | 26.3.0 | **26** | low | |
| `squawk-cli` | `^2.62.0` | 2.63.0 | **2** | low | |
| `highlight.js` | `—` | 11.12.0 | **11** | low | Major unchanged since 2021. Class-based output as assumed. |
| `markdown-it` | `^15.0.0` | 15.0.0 | **15** | low | Spiked in Phase 1d. Self-typed, so `@types/markdown-it` is not installed and must not be. Both below. |

## Prisma's `latest` tag points at a release candidate

```
prisma          latest = 8.0.0-rc.10     prev = 7.10.0
@prisma/client  latest = 7.10.0
```

Two hazards, not one. `npm i prisma@latest` pulls a release candidate. And
because the client's tag has *not* moved, `npm i prisma@latest
@prisma/client@latest` installs a version-skewed pair — CLI on 8, client on
7 — which is worse than either alone.

**Always install Prisma packages with an explicit `^7`.** Never by tag,
never with a bare `npm update`. If `npm ci` ever resolves a Prisma package
outside major 7, stop and report it rather than adapting the code.

## Raw SQL is permitted only where the DSL is wrong or has no form

> Raw SQL is permitted where the DSL is **wrong**, or where it has **no form**
> for the statement at all. Nowhere else, and never for brevity. Every raw
> query carries a comment naming the DSL construct it rejects and what that
> construct would have done.

Three call sites outside `src/generated` qualify. `resolveRepo` rejects
`mode: "insensitive"`, which emits `ILIKE`: `_` is a wildcard there, and
`ILIKE` cannot use `repos_name_lower_key`. `listRepos` rejects `orderBy`,
which takes columns rather than expressions and would sort the `COLLATE "C"`
column. The visual fixture's `TRUNCATE ... CASCADE` has no DSL form at all,
and `deleteMany({})` is a different statement rather than a translation.

## Biome replaced Prettier and ESLint

One binary for both jobs. The deciding factor was TypeScript 7:
`typescript-eslint` peer-caps at `typescript: >=4.8.4 <6.1.0`, so the
ESLint path is unavailable on this toolchain. Biome parses TypeScript
itself and has no `typescript` peer dependency at all.

Rule configuration is the default preset and nothing else. Add a rule when
a real bug motivates one, never because it sounded good in a list.

Two things that bit us and will bite again:

- `biome migrate --write` translated `rules: { recommended: true }` into
  `rules: { preset: "none" }`, silently disabling every rule. Migrate
  deliberately when upgrading, then confirm the linter still bites. The
  pre-commit hook has a probe for exactly this.
- `biome check` errors when it is handed only files it does not
  handle — a commit touching just `.sh` or `.md`. The hook passes
  `--no-errors-on-unmatched`. `--files-ignore-unknown` is the flag that
  looks right and is not.

## markdown-it 15 — spiked in Phase 1d, resolved

Version 15 shipped 2026-07-30. CLAUDE.md's gotchas were written against
14.x; Phase 1d spiked the installed 15.0.0 and CLAUDE.md now carries the
measured behavior. Every API question below is answered by measurement.
The `@types` dependency was the last open question; it is settled in the
next section.

**Confirmed changed in 15.0.0:**

- `validateLink`, `normalizeLink`, and `normalizeLinkText` moved from
  instance properties to **prototype methods**. Measured: `md.validateLink =
  fn` still shadows the prototype, because an own property wins.
- `linkify-it` upgraded to v6: no fuzzy links, no auth checks, Unicode
  punctuation terminates links. Low impact while only the `table` rule is
  enabled.
- Package-internal subpath exports (`markdown-it/lib/*`) removed.
- `text_join` now also processes image alt text.
- `StateBlock#ddIndent` removed.
- A `strip_references` core rule was added after `block`.
- The bundled declarations export the class **as a type only**. The default
  export is a callable wrapper, so `const md: MarkdownIt` — legal under
  `@types/markdown-it@14`, which declared a class — is now `TS2749`. Import
  the type by name:
  `import MarkdownIt, { type MarkdownIt as MarkdownItInstance }`.

**Confirmed unchanged, measured against 15.0.0:**

- `new MarkdownIt('commonmark')` still sets `html: true`. Passing
  `{ html: false }` explicitly stays correct and stays mandatory.
- `text_join` is still the last core rule, and
  `md.core.ruler.before('text_join', ...)` still places a rule immediately
  ahead of it. An escaped `\#12` yields a `text_special` token before
  `text_join` runs and a plain `#12` text token after, so registration order
  is what decides whether the escape holds.
- The default `validateLink` is a four-scheme blocklist,
  `/^(vbscript|javascript|file|data):/`, so it still fails open.

## Why `@types/markdown-it` is not installed

**Settled in Phase 1d. Do not add it back.** It was installed briefly
because the 1d brief called for it, and removed once measurement showed the
brief was wrong. `docs/PLAN.md` §04, _Markdown — strict CommonMark, one deviation_, had it
right from the start.

15 bundles `dist/markdown-it.d.mts`, and the 15.0.0 changelog says to remove
`@types/markdown-it`. TypeScript resolves a bare `import` to the bundled
declarations and never consults `@types` — verified with `--traceResolution`.

The hazard is subpaths. 15's `exports` map has no `./lib/*`, but
`@types/markdown-it@14.2.0` exports `./*`, so TypeScript falls through to it
and a subpath that does not exist at runtime type-checks clean:

```
import StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
  with @types/markdown-it@14   tsc --strict exit 0, node ERR_PACKAGE_PATH_NOT_EXPORTED
  without it                   tsc --strict exit 1, TS2307
```

Both rows are measured, the second after the uninstall — the failing compile
is what proves the trap is gone rather than merely unused. `@types` 14 also
still declares `StateBlock#ddIndent`, which 15 removed.

## Known advisories

`deepmerge-ts <8.0.0` (GHSA-ggr8-5vv4-36mx), reached only through the
Prisma CLI's config loader. Not in the serving path, and the input is our
own `prisma.config.ts`. `@prisma/config` pins `deepmerge-ts` at exactly
7.1.5 in both 7.9.1 and 7.10.0, so there is no fix within Prisma 7.
**Never run `npm audit fix --force`** — it downgrades to `prisma@6.12.0`,
undoing the Prisma 7 migration entirely. Tracked in `local/TODOs.md`.

## The visual capture image is pinned to the installed Playwright

`compose.yaml`'s `visual` service runs
**`mcr.microsoft.com/playwright:v1.62.1-noble`**, digest
`sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`
for `linux/arm64`. It ships Node v24.18.1, satisfying `engines.node >=24`,
and Chromium 151.0.7922.34.

The tag carries the version because the committed baselines are only
reproducible against one browser build. `package.json` declares the range
`^1.62.1`; what makes it exact is `package-lock.json` pinning 1.62.1 and
`scripts/visual-docker.sh` installing with `npm ci`, which honors the
lockfile. If the lockfile moves, the image tag moves with it in the same
commit and every baseline is re-shot.

**The platform pin is `linux/arm64`, and it is not the usual choice.**
GitHub's hosted x86_64 runners would argue for `linux/amd64`, but Chromium
cannot run amd64-emulated under Colima on Apple silicon — the headless
shell aborts inside QEMU (`Assertion failed: p_rcu_reader->depth != 0`,
`/qemu/include/qemu/rcu.h`, SIGABRT), so amd64 is unavailable rather than
slow. A workflow that later consumes these baselines must select an arm64
runner or re-shoot them once.

**Nothing will flag the mismatch for you.** Tuffgal decides a baseline set
needs re-approval by diffing `PIXEL_AFFECTING_KEYS` against the committed
`manifest.json`. The only key in that list describing the machine is
`platform`, taken from `process.platform`, which is `"linux"` on arm64 and
amd64 alike; there is no architecture key, and none is written into the
manifest. So an amd64 runner reports a Skia rasterisation delta as an
ordinary pending baseline change (exit 2), indistinguishable from a real
UI regression, rather than as an environment mismatch (exit 3).

**`--force-color-profile=srgb` was never missing.** Playwright's own
Chromium launch already carries it: `playwright-core@1.62.1` bundles it
in the default `chromiumSwitches`, so a bare `chromium.launch({
headless: true })` — the exact 0.2.1-alpha.1 shape — sets it on every
run. An earlier pass of this document recorded the flag as unreachable
without checking Playwright's own defaults first, which was wrong.
`tuffgal.config.ts` carries no `browserArgs` entry for it; adding one
would only duplicate a switch Chromium already takes.

`tuffgal@0.2.2-alpha.1` (`nschneble/tuffgal#49`) does add a real
`browserArgs` config seam — `runner/run.js` launches with
`resolveLaunchOptions`, which returns `{ headless, args:
config.browserArgs }` — for the day a project genuinely needs a launch
flag Playwright doesn't already set. This project doesn't need it for
srgb. `browserArgs` is not in `PIXEL_AFFECTING_KEYS` and is not written
into `manifest.json`, so if a future project use of it ever needs
guarding against silent drift, that gap is still open then.

**Inside the compose network Postgres is `postgres:5432`.** The host's
`127.0.0.1:5433` is a published port and it is wrong in the container,
which is why `compose.yaml` gives the `visual` service its own
`DATABASE_URL` rather than letting the host's url through. `visual.sh`
prefers an inherited `DATABASE_URL` over the one it reads from `.env` for
the same reason: that file is on the container's bind mount, and its url
is the host's.

Two things diverge between a laptop and this image, and both change bytes:

- **Text rasterisation.** CoreText and FreeType/Skia hint and antialias
  differently, and the UI is a subset face at six weights.
- **The gzip the budget is measured in.** Node 26 on the laptop links
  zlib 1.2.12; the image's Node 24 links 1.3.1. The same blob page fits
  **99** source lines on the laptop and **104** in the image, because the
  cap is computed from real gzip-5 wire bytes. The container is the
  authority: it is what CI runs.

## Not surveyed

Node, Postgres, Caddy, and Docker Compose are pinned by `compose.yaml` and
the Phase 2 Dockerfile rather than by npm, and move on their own schedule.
Check them when Phase 2 writes those files. Note that `.squawk.toml`'s
`pg_version` must match `compose.yaml`'s image tag; Phase 1a's exit check
17 asserts it, because they drift silently.

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
| `ssh2` | `^1.17.0` | 1.17.0 | **1** | none | Verified end-to-end on the dev laptop in Phase 0. CLAUDE.md's three gotchas are confirmed against this exact version. |
| `@types/ssh2` | `^1.15.5` | 1.15.5 | **1** | low | `ssh2` ships no types of its own. |
| `@biomejs/biome` | `^2.5.10` | 2.5.10 | **2** | low | Formatter and linter. Replaced Prettier; see below. |
| `typescript` | `^7.0.2` | 7.0.2 | **7** | medium | The Go-native compiler. Fast, but much of the ecosystem has not caught up — see the Biome note. |
| `@types/node` | `^26.3.0` | 26.3.0 | **26** | low | |
| `squawk-cli` | `^2.62.0` | 2.63.0 | **2** | low | |
| `highlight.js` | `—` | 11.12.0 | **11** | low | Major unchanged since 2021. Class-based output as assumed. |
| `markdown-it` | `^15.0.0` | 15.0.0 | **15** | low | Spiked in Phase 1d; see below. Ships its own TypeScript declarations. |
| `@types/markdown-it` | `^14.2.0` | 14.2.0 | **14** | **see below** | Redundant against 15's bundled types, and its `./*` export makes a removed subpath type-check. |

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
measured behaviour. Every API question below is answered by measurement.
The one thing still open is the `@types` dependency, in the next section.

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

## `@types/markdown-it` is redundant and actively misleading

15 bundles `dist/markdown-it.d.mts`, and the 15.0.0 changelog says to remove
`@types/markdown-it`. TypeScript resolves a bare `import` to the bundled
declarations and never consults `@types` — verified with `--traceResolution`.

The hazard is subpaths. 15's `exports` map has no `./lib/*`, but
`@types/markdown-it@14.2.0` exports `./*`, so TypeScript falls through to it:

```
import StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
  tsc --strict   exit 0
  node           ERR_PACKAGE_PATH_NOT_EXPORTED
```

It also still declares `StateBlock#ddIndent`, which 15 removed.

**Open decision.** `docs/PLAN.md` §"markdown-it 15.0.0 is the pick" already
records that v15 ships first-party types and `@types/markdown-it` is
obsolete. The 1d brief requires it anyway — line 37, and exit criterion 19.
Those two disagree, and PLAN.md is the one that matches the measurement.
Dropping the dependency removes the trap and loses nothing, but it changes a
stated exit criterion, so it is Nick's call, not the phase's.

## Known advisories

`deepmerge-ts <8.0.0` (GHSA-ggr8-5vv4-36mx), reached only through the
Prisma CLI's config loader. Not in the serving path, and the input is our
own `prisma.config.ts`. `@prisma/config` pins `deepmerge-ts` at exactly
7.1.5 in both 7.9.1 and 7.10.0, so there is no fix within Prisma 7.
**Never run `npm audit fix --force`** — it downgrades to `prisma@6.12.0`,
undoing the Prisma 7 migration entirely. Tracked in `local/TODOs.md`.

## Not surveyed

Node, Postgres, Caddy, and Docker Compose are pinned by `compose.yaml` and
the Phase 2 Dockerfile rather than by npm, and move on their own schedule.
Check them when Phase 2 writes those files. Note that `.squawk.toml`'s
`pg_version` must match `compose.yaml`'s image tag; Phase 1a's exit check
17 asserts it, because they drift silently.

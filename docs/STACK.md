# Stack currency

_Verified 2026-08-25. Re-verify before writing each phase brief._

Every version-sensitive claim in a phase brief is written against the
majors below. **"Install latest stable" means latest within the pinned
major here** — not whatever `npm install` resolves to on the day. A brief
written against a version that had moved was the repeated failure mode in
Phase 1a, costing six amendments.

| Package | Verified | Major | Risk | Note |
|---|---|---|---|---|
| `prisma` | 7.9.1 | **7** | **see below** | Pinned `^7.9.1`; the installed tree is 7.9.1. The `latest` dist-tag points at an 8.0 release candidate. Never install by tag. |
| `@prisma/client` | 7.10.0 | **7** | low | `latest` is still 7.10.0 — it does *not* track the CLI's tag. |
| `@prisma/adapter-pg` | 7.10.0 | **7** | low | Tracks the Prisma major. Owns `pg` transitively; never add `pg` directly. |
| `fastify` | 5.12.1 | **5** | low | The raw content-type parser for `application/x-git-*-request` (1c) is a v5 API. |
| `ssh2` | 1.17.0 | **1** | none | Verified end-to-end on the dev laptop in Phase 0. CLAUDE.md's three gotchas are confirmed against this exact version. |
| `@types/ssh2` | 1.15.5 | **1** | low | `ssh2` ships no types of its own. |
| `@biomejs/biome` | 2.5.10 | **2** | low | Formatter and linter. Replaced Prettier; see below. |
| `typescript` | 7.0.2 | **7** | medium | The Go-native compiler. Fast, but much of the ecosystem has not caught up — see the Biome note. |
| `@types/node` | 26.3.0 | **26** | low | |
| `squawk-cli` | 2.63.0 | **2** | low | |
| `highlight.js` | 11.12.0 | **11** | low | Major unchanged since 2021. Class-based output as assumed. |
| `markdown-it` | 15.0.0 | **15** | **see below** | New major. Blocks Phase 3 until spiked. |

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

## markdown-it 15 — unresolved, blocks Phase 3

CLAUDE.md's markdown-it gotchas were written against 14.x. Version 15
shipped 2026-07-30 and changes at least one thing that section depends on.

**Confirmed changed in 15.0.0:**

- `validateLink`, `normalizeLink`, and `normalizeLinkText` moved from
  instance properties to **prototype methods**. CLAUDE.md's "replace
  `validateLink` with an allowlist" may still work by instance assignment,
  which shadows the prototype — but that must be tested, not assumed.
- `linkify-it` upgraded to v6: no fuzzy links, no auth checks, Unicode
  punctuation terminates links. Low impact while only the `table` rule is
  enabled.
- Package-internal subpath exports (`markdown-it/lib/*`) removed.
- `text_join` now also processes image alt text.
- `StateBlock#ddIndent` removed.

**Not confirmed — verify before writing Phase 3:**

- Whether `new MarkdownIt('commonmark')` still sets `html: true`. Passing
  `{ html: false }` explicitly is correct either way, so the guidance is
  safe even if the preset changed.
- Whether `text_join` is still the last core rule, and whether
  `md.core.ruler.before('text_join', ...)` still positions the
  cross-reference autolinker correctly.

**Action for Phase 3:** the first task of that session is a spike against
the installed markdown-it — assert the allowlist actually rejects
`javascript:`, and that `#12` inside an escaped `\#12` is left alone. Only
then write the pipeline.

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

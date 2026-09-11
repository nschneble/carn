<!-- This file is the source of truth. The artifact at
     https://claude.ai/code/artifact/d6827af7-8151-4e7b-aace-e29617e51f99
     is generated from this Markdown by `scripts/docs-artifact.mjs`. Edit
     here and run the script to update the build artifacts. -->

**STACK CURRENCY**

# Pinned majors, and the drift between them

Every version-sensitive claim in a phase brief is written against the majors below. Process note: "Install latest stable" means the latest version **within** the pinned major here; not whatever `npm install` resolves to on the day. A brief written against a version that's moved was a repeated failure mode in Phase 1a.

> **Pinned here vs Latest on npm**
>
> "Pinned here" is what `package.json` declares. The "Latest on npm" column was last verified on 2026-08-25. Re-verify before writing each phase brief. The two columns are allowed to differ; a gap is not a defect.

| Package              | Pinned here | Latest on npm | Major  | Risk      | Notes                                                                             |
| -------------------- | ----------- | ------------- | ------ | --------- | --------------------------------------------------------------------------------- |
| `@biomejs/biome`     | `^2.5.10`   | 2.5.10        | **2**  | low       | Formatter and linter. Replaced Prettier; see below.                               |
| `@prisma/adapter-pg` | `^7.9.1`    | 7.10.0        | **7**  | low       | Tracks the Prisma major. Owns `pg` transitively.                                  |
| `@prisma/client`     | `^7.9.1`    | 7.10.0        | **7**  | low       | `latest` is still 7.10.0. It doesn't track the CLI's tag.                         |
| `@types/node`        | `^26.3.0`   | 26.3.0        | **26** | low       |                                                                                   |
| `@types/ssh2`        | `^1.15.5`   | 1.15.5        | **1**  | low       | `ssh2` ships no types of its own.                                                 |
| `fastify`            | `^5.12.1`   | 5.12.1        | **5**  | low       | Raw content-type parser for `application/x-git-*-request` (1c) is a v5 API.       |
| `highlight.js`       | `-`         | 11.12.0       | **11** | low       | Major unchanged since 2021. Class-based output as assumed.                        |
| `markdown-it`        | `^15.0.0`   | 15.0.0        | **15** | low       | Spiked in Phase 1d. Self-typed, so `@types/markdown-it` isn't installed.          |
| `prisma`             | `^7.9.1`    | 7.9.1         | **7**  | see below | `latest` dist-tag points to 8.0 release candidate. Never install by tag.          |
| `squawk-cli`         | `^2.62.0`   | 2.63.0        | **2**  | low       |                                                                                   |
| `ssh2`               | `^1.17.0`   | 1.17.0        | **1**  | none      | Verified in Phase 0. CLAUDE.md's gotchas are confirmed against this version.      |
| `typescript`         | `^7.0.2`    | 7.0.2         | **7**  | medium    | Go-native compiler. Fast. Much of the ecosystem hasn't caught up; see Biome note. |

## Prisma's `latest` tag points at a release candidate

```
@prisma/client  latest=7.10.0
prisma          latest=8.0.0-rc.10  prev=7.10.0
```

`npm i prisma@latest` pulls a release candidate, and because the client's tag hasn't moved, `npm i prisma@latest @prisma/client@latest` installs a version-skewed pair: CLI on 8, client on 7.

**Always install Prisma packages with an explicit `^7`.** Never by tag, never with a bare `npm update`. If `npm ci` ever resolves a Prisma package outside major 7, stop and report it rather than adapting the code.

## Raw SQL is only permitted when the DSL can't handle it

> Raw SQL is permitted when the DSL is **incorrect** or has **no form** for the statement. Nowhere else. Never for brevity. Every raw query carries a comment naming the DSL construct it rejects and what that construct would've done.

Three call sites outside `src/generated` qualify:

1. `resolveRepo` rejects `mode: "insensitive"`, which emits `ILIKE`: `_` is a wildcard there, and `ILIKE` cannot use `repos_name_lower_key`.
2. `listRepos` rejects `orderBy`, which takes columns rather than expressions and would sort the `COLLATE "C"` column.
3. The visual fixture's `TRUNCATE ... CASCADE` has no DSL form at all, and `deleteMany({})` is a different statement rather than a translation.

## Biome replaced Prettier and ESLint

It's a two-for-one. Besides, `typescript-eslint` doesn't support TypeScript 7. Biome parses TypeScript itself and doesn't have any `typescript` peer dependencies.

Rule configuration is the default preset. Only add a custom rule when a real bug surfaces.

Two learning lessions from early Biome failures:

- `biome migrate --write` translates `rules: { recommended: true }` into `rules: { preset: "none" }`, silently disabling every rule. Migrate deliberately when upgrading. The pre-commit hook has a probe for this.
- `biome check` errors when it's handed only files it doesn't handle, e.g. a commit touching just `.sh` or `.md`. The hook passes `--no-errors-on-unmatched` to address this. Surprisingly, `--files-ignore-unknown` is not the correct flag here.

## markdown-it 15

Version 15 shipped on 2026-07-30. CLAUDE.md's OG gotchas were written against 14.x; Phase 1d spiked on the installed 15.0.0 and CLAUDE.md now carries the measured behavior. Every API question below is answered by measurement. The `@types` dependency was the last open question; it's settled in the next section.

**Confirmed changes in 15.0.0:**

- A `strip_references` core rule was added after `block`.
- `linkify-it` was upgraded to v6: no fuzzy links, no auth checks, and Unicode punctuation terminates links. Low impact while only the `table` rule is enabled.
- Package-internal subpath exports (`markdown-it/lib/*`) removed.
- `StateBlock#ddIndent` removed.
- `text_join` now also processes image alt text.
- The bundled declarations export the class **as a type only**. The default export is a callable wrapper, so `const md: MarkdownIt`, legal under `@types/markdown-it@14` and which declared a class, is now `TS2749`. Import the type by name: `import MarkdownIt, { type MarkdownIt as MarkdownItInstance }`.
- `validateLink`, `normalizeLink`, and `normalizeLinkText` were moved from instance properties to **prototype methods**.

**Confirmed "unchanges", measured against 15.0.0:**

- `new MarkdownIt('commonmark')` still sets `html: true`. Passing `{ html: false }` explicitly stays correct and stays mandatory.
- `text_join` is still the last core rule, and `md.core.ruler.before('text_join', ...)` still places a rule immediately ahead of it. An escaped `\#12` yields a `text_special` token before `text_join` runs and a plain `#12` text token after, so registration order still matters.
- The default `validateLink` is a four-scheme blocklist, `/^(vbscript|javascript|file|data):/`, so it still fails open.

## Why `@types/markdown-it` isn't installed

**Settled in Phase 1d. Don't re-add it.** It was installed briefly because the 1d brief called for it, and removed once measurements showed the brief was wrong. `docs/PLAN.md` §04, _Markdown_, had it right from the start.

15 bundles `dist/markdown-it.d.mts`, and the 15.0.0 changelog says to remove `@types/markdown-it`. TypeScript resolves a bare `import` to the bundled declarations and never consults `@types`; verified with `--traceResolution`.

The hazard is subpaths. 15's `exports` map has no `./lib/*`, but `@types/markdown-it@14.2.0` exports `./*`, so TypeScript falls through to it and a subpath that doesn't exist at runtime type-checks clean:

```ts
import StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

// with @types/markdown-it@14  tsc --strict exit 0, node ERR_PACKAGE_PATH_NOT_EXPORTED
// without it                  tsc --strict exit 1, TS2307
```

Both rows are measured; the second after the uninstall. `@types` 14 also still declares `StateBlock#ddIndent`, which 15 removed.

## Known advisories

`deepmerge-ts <8.0.0` (GHSA-ggr8-5vv4-36mx), reached only through the Prisma CLI's config loader. The input is our own `prisma.config.ts`. `@prisma/config` pins `deepmerge-ts` to 7.1.5 in both 7.9.1 and 7.10.0, so there's no fix within Prisma 7. **Never run `npm audit fix --force`.** It'd downgrade to `prisma@6.12.0` and entirely undo the Prisma 7 migration. Tracked in `local/TODOs.md`.

## Tuffgal baselines are pinned to Playwright

`compose.yaml`'s `visual` service runs **`mcr.microsoft.com/playwright:v1.62.1-noble`**, digest `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e` for `linux/arm64`. It ships Node v24.18.1, satisfying `engines.node >=24`, and Chromium 151.0.7922.34.

The tag carries the version because the committed baselines are only reproducible against one browser build. `package.json` declares the range as `^1.62.1`, but `package-lock.json` pins 1.62.1 and `scripts/visual-docker.sh` installs with `npm ci`, which honors the lockfile. If the lockfile moves, the image tag moves with it in the same commit and every baseline is re-shot.

**The platform pin is `linux/arm64`.** GitHub's hosted x86_64 runners would argue for `linux/amd64`, but Chromium crashes running amd64 on Apple silicon. Any workflow that consumes these baselines must select an arm64 runner or re-shoot them once.

**The arm64/amd64 mismatch won't be flagged automatically.** Tuffgal decides a baseline set needs re-approval by diffing `PIXEL_AFFECTING_KEYS` against the committed `manifest.json`. The only key in that list describing the machine is `platform`, taken from `process.platform`, which is `"linux"` on arm64 and amd64 alike; there's no architecture key. So an amd64 runner reports a Skia rasterisation delta as an ordinary pending baseline change (exit 2), indistinguishable from a real UI regression, rather than as an environment mismatch (exit 3).

**Postgres is `postgres:5432` inside the compose network.** The host's `127.0.0.1:5433` is a published port that's incorrect for the container, so `compose.yaml` gives the `visual` service its own `DATABASE_URL`. `visual.sh` prefers an inherited `DATABASE_URL` over the one it reads from `.env` for the same reason: that file is on the container's bind mount, and its url is the host's.

Two things diverge between a local environment and this image:

- **Text rasterization.** CoreText and FreeType/Skia hint and antialias differently, and the UI is a subset face with six weights.
- **The gzip measured for the budget.** Node 26 links zlib 1.2.12 locally; the image's Node 24 links 1.3.1. The same blob page fits **99** source lines locally and **104** in the image, because the cap is computed from real gzip-5 wire bytes. The container is the authority: it's what CI runs.

## Not surveyed

Node, Postgres, Caddy, and Docker Compose are pinned by `compose.yaml` and the Phase 2 Dockerfile rather than by npm, and move on their own schedule. Check them when Phase 2 writes those files. Note that `.squawk.toml`'s `pg_version` must match `compose.yaml`'s image tag; Phase 1a's exit check 17 asserts it, because they drift silently.

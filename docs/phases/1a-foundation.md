# Phase 1a · Foundation

_Schema, app skeleton, and the escaping primitive. No git anywhere._

This is the first of four briefs that together make up Phase 1 of
`docs/PLAN.md` §08. The split exists so each handoff has a mechanical exit
check and a human review before the next one starts.

| Sub-phase | Scope                                                 | Exit                |
| --------- | ----------------------------------------------------- | ------------------- |
| **1a**    | Schema, Fastify skeleton, `html` tag                  | This document       |
| 1b        | SSH listener, auth against `ssh_keys`, push-to-create | Push a real repo    |
| 1c        | Anonymous smart-HTTP read                             | Anonymous clone     |
| 1d        | Browsing views + the design system                    | The page looks good |

> **Amendment 1 — Prisma 7.** The first draft of this brief assumed the
> Prisma 6 schema shape. Prisma 7 removed `url` from the `datasource`
> block: the CLI hard-errors with P1012, _"The datasource property `url` is
> no longer supported in schema files."_ The connection string moves to
> `prisma.config.ts`, and `PrismaClient` now requires a driver adapter.
>
> Resolution: **stay on Prisma 7.** The budget gains exactly one direct
> dependency, `@prisma/adapter-pg` (`pg` arrives transitively — do not add
> it to `package.json` unless you import it directly, which you should not
> need to). The generator, config, and `db.ts` sections below are updated.

> **Amendment 2 — timestamps are `timestamptz`.** The first draft's schema
> used bare `DateTime`, which Prisma maps to `TIMESTAMP(3)` — no time zone.
> Squawk's `prefer-timestamp-tz` is correct to flag it and **must not be
> excluded**. Every timestamp column in Càrn records an instant, so all of
> them are `@db.Timestamptz(3)`. This is a standing rule for every later
> phase, not a fix for these four columns.

> **Amendment 3 — no shadow database.** Exit check 5 originally used
> `--from-migrations`, which replays migration history and therefore needs
> somewhere to replay it into. Do not add one. Prisma 7 removed the
> `--from-url` / `--to-url` / `--shadow-database-url` flags and replaced
> them with `--from-config-datasource` / `--to-config-datasource`, which is
> the simpler instrument here:
>
> ```
> prisma migrate diff --from-config-datasource \
>   --to-schema prisma/schema.prisma --exit-code
> ```
>
> Check 4 has already replayed every migration into an empty database, so
> the live database _is_ the migration history's output. Diffing it against
> the schema tests the same property with no second database, no
> `CREATEDB` dependency, and nothing extra for Phase 2's CI to provision.
> Note `--to-schema`, not v6's `--to-schema-datamodel`.

> **Amendment 4 — `next_number` stays `Int`.** Amendment 2 said the squawk
> pre-authorization covers "empty-table false positives and nothing else,"
> then named three never-excludable rules. That wording supports two
> readings, and the two-way split it implied was wrong: it has no slot for
> a rule that flags a capacity ceiling you will never reach. The squawk
> section below now sorts findings into three categories by principle
> rather than by a list of rule names. `prefer-bigint-over-int` on
> `repos.next_number` is excludable **inline**; `Int` is correct.

> **Amendment 5 — `.squawk.toml` stays, for facts.** Amendment 4 banned the
> file outright. That was wrong: it conflated _configuration_ with
> _exclusion_. `pg_version` and `assume_in_transaction` are environmental
> facts, and deleting them makes squawk lint against assumptions that are
> not true of this project — raising more findings, not fewer. Keep the
> file; it must contain no `excluded_rules`. A new step 0 in the squawk
> section below comes before the three categories.

> **Amendment 6 — `assume_in_transaction` must be measured, not asserted.**
> Amendment 5 stated as fact that Prisma wraps each migration in a
> transaction. Measurement on this codebase says otherwise: no
> `BEGIN`/`COMMIT` in the Postgres log, and a mid-file failure left partial
> commits rather than rolling back. Setting the flag `true` on that false
> premise silenced 24 findings — configuration used as concealed exclusion,
> which is precisely what Amendment 5 forbade.
>
> Resolve in this order:
>
> 1. **Try to make the fact true.** Add explicit `BEGIN;` / `COMMIT;` to
>    the migration file and re-measure. Postgres has transactional DDL, and
>    atomic migrations are worth having before Phase 2 puts this on a VPS
>    where a half-applied migration means manual recovery.
>
>    Note that this does **not** make `assume_in_transaction = true`. That
>    flag describes what _Prisma_ does, which is still nothing — it splits
>    the file on `;` and autocommits each statement. An explicit `BEGIN` is
>    something squawk reads straight out of the SQL, so the flag stays
>    `false` and is simply not needed. Setting it `true` would trade one
>    false claim for another.
>
> 2. **If that does not work, make the config honest.** Set
>    `assume_in_transaction = false`, re-run, and triage what returns
>    through the three categories below. Expect
>    `require-concurrent-index-creation` to land in category 1 (empty tables
>    created in the same migration) and `prefer-robust-stmts` to be a
>    _genuine_ finding — non-atomic migrations really do need idempotent
>    statements, because a partial failure is now a state you can reach.
>
> Report which path you took and the evidence for it. Either way, whether
> migrations are atomic is a deploy-safety property that Phase 2 inherits,
> so it gets decided here rather than discovered there.

**Read `.claude/CLAUDE.md` first, in full.** It holds the constraints, the
stack, the naming registers, and the verified gotchas. This brief does not
repeat them. Where the two disagree, CLAUDE.md wins and you should say so
rather than picking one.

---

## What 1a is

A Fastify app that boots, connects to Postgres, serves `/health`, and has
the four Phase-1 tables migrated with an admin seeded. Plus the `html`
tagged template function, because every later phase renders through it and
it is the one piece of this codebase where a mistake is a vulnerability
rather than a bug.

There is no git subprocess in 1a. There is no HTML page in 1a. If you find
yourself writing either, stop — you have left the scope.

## What 1a is not

Do not build any of the following. They belong to later sub-phases and
building them early makes the review harder, not easier:

- Any `spawn`, any git call, any repo on disk
- The SSH listener (1b) or smart-HTTP (1c)
- Any route other than `/health`
- Stylesheet, fonts, design tokens, layout, templates (1d)
- A Dockerfile for the app — Phase 2 covers deployment; 1a only needs
  Postgres in Compose
- The `issues`, `pull_requests`, `comments`, `events`, `releases`, or
  `settings` tables — those arrive with the phases that use them
- **A reserved-name list.** The `/r/` prefix makes route collisions
  structurally impossible. PLAN.md §06 is explicit that there is no list to
  maintain. Do not add one.
- Sessions, cookies, CSRF, or any auth middleware. There is no auth.
- Rate limiting

---

## Runtime and tooling

Decisions, not options. Do not substitute.

- **Node 24** pinned in Compose and in `engines`. Set `"engines": { "node":
  ">=24" }` — the dev laptop runs 26 and both must work.
- **TypeScript compiled with `tsc`**, `strict: true`, no bundler. Vite is
  explicitly out; so is any loader-based TS execution. Build to `dist/`
  with `rootDir: "."` so `dist/src/` and `dist/test/` both exist.
- **ESM.** `"type": "module"`, `module: "nodenext"`, `moduleResolution:
  "nodenext"`. Use explicit `.js` extensions in relative imports, as
  nodenext requires.
- **`node --test`** as the test runner. Jest and Vitest are explicitly out
  in CLAUDE.md. Tests run against compiled output: `node --test
  dist/test/`.
- Install **latest stable** of each dependency rather than pinning to a
  version named here, and report the resolved versions in your handoff
  notes.

### Dependency budget

Runtime: `fastify`, `@prisma/client`, `@prisma/adapter-pg`. Dev: `prisma`,
`typescript`, `@types/node`, `squawk-cli`, `@biomejs/biome`.

`pg` is a transitive dependency of the adapter. Do not add it directly —
the adapter owns the `Pool`, and a second copy in `package.json` invites a
version skew that only shows up under load.

Licenses check out for AGPL: `pg` is MIT, the Prisma packages Apache-2.0.

That is the entire list for 1a. CLAUDE.md's rule applies: **stop and ask**
before adding anything else, including anything that looks obviously
harmless like `zod` (the config parser below is twenty lines).

**On `dotenv`:** Prisma 7 no longer auto-loads `.env`, and the official
`prisma init` template papers over this with `import 'dotenv/config'`. Do
not add `dotenv`. Have `prisma.config.ts` read `process.env.DATABASE_URL`
directly, and have the npm scripts that invoke the Prisma CLI source the
file first:

```json
"migrate": "set -a && . ./.env && set +a && prisma migrate deploy"
```

The app itself uses Node's built-in `--env-file=.env`. If this turns out
not to work, say so rather than reaching for the package.

---

## File manifest

Create exactly these. Every `.ts` file starts with `//
SPDX-License-Identifier: AGPL-3.0-or-later` as its first line.

```
src/
  index.ts                  entry point: build, listen, log
  app.ts                    Fastify factory, returns app without listening
  config.ts                 env parsing, fails fast
  db.ts                     PrismaClient singleton
  routes/
    health.ts               GET /health
  html/
    index.ts                html`` tag, raw(), escape()
prisma.config.ts            datasource URL for the CLI (Prisma 7)
prisma/
  schema.prisma
  migrations/               generated, then hand-edited (see below)
test/
  contract/
    escaping.contract.ts
    headers.contract.ts
scripts/
  verify-phase-1a.sh        the exit checks below, as a script
compose.yaml                Postgres only
.env.example                every var, with safe defaults
.squawk.toml                environmental facts only — no excluded_rules
tsconfig.json
```

`app.ts` returning an unstarted app and `index.ts` doing the listening is
not ceremony — the contract tests need to boot the app in-process.

---

## Schema

Four tables. Field names follow `docs/PLAN.md` §05 exactly. Postgres names
are `snake_case` via `@map`; TypeScript sees `camelCase`.

The `datasource` block carries **`provider` only** — no `url`, no
`directUrl`, no `shadowDatabaseUrl`. The generator is `prisma-client`, not
the deprecated `prisma-client-js`; it emits into a path you specify with
`output`, and the import in `db.ts` changes accordingly. Check the
generated import path rather than assuming `@prisma/client`.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

Add `src/generated/` to `.gitignore` and generate on build.

```prisma
model User {
  id          String      @id @default(uuid()) @db.Uuid
  handle      String      @unique
  displayName String      @map("display_name")
  email       String
  isAdmin     Boolean     @default(false) @map("is_admin")
  createdAt   DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  sshKeys     SshKey[]
  ownedRepos  Repo[]      @relation("RepoOwner")
  grants      RepoGrant[]
  @@map("users")
}

model SshKey {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  name        String
  publicKey   String    @map("public_key")
  fingerprint String    @unique
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  lastUsedAt  DateTime? @map("last_used_at") @db.Timestamptz(3)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("ssh_keys")
}

model Repo {
  id            String      @id @default(uuid()) @db.Uuid
  ownerId       String      @map("owner_id") @db.Uuid
  name          String
  description   String?
  defaultBranch String      @default("main") @map("default_branch")
  nextNumber    Int         @default(1) @map("next_number")
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  owner         User        @relation("RepoOwner", fields: [ownerId], references: [id])
  grants        RepoGrant[]
  @@map("repos")
}

model RepoGrant {
  repoId String     @map("repo_id") @db.Uuid
  userId String     @map("user_id") @db.Uuid
  level  GrantLevel
  repo   Repo       @relation(fields: [repoId], references: [id], onDelete: Cascade)
  user   User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([repoId, userId])
  @@map("repo_grants")
}

enum GrantLevel {
  write
  admin
  @@map("grant_level")
}
```

Notes that are decisions, not observations:

- **No password column on `users`, ever.** SSH keys are the entire auth
  system.
- **No `is_public` on `repos`.** Everything is public. Adding the column
  "just in case" is the exact move CLAUDE.md's `Never` list forbids.
- `repo_grants` has no `id` — the composite key is the row's identity, and
  read is implicit for everyone, so absence of a row means read-only.
- `owner_id` has **no** `onDelete: Cascade`. Deleting a user who owns repos
  should fail loudly.

### Two things Prisma cannot express

Both go into the generated migration SQL by hand, after `prisma migrate dev
--create-only` and before applying:

**1 · The unique index is on `lower(name)`, not `name`.** PLAN.md §06
changed the constraint when the owner segment left the URL. Prisma has no
syntax for a functional index, so append:

```sql
CREATE UNIQUE INDEX repos_name_lower_key ON repos (lower(name));
```

Do not also leave a plain `@unique` on `name` in the schema — it would
permit `Foo` and `foo` to coexist, which the URL space cannot represent.
All lookups are `WHERE lower(name) = lower($1)`.

**2 · A format check on repo names:**

```sql
ALTER TABLE repos ADD CONSTRAINT repos_name_format
  CHECK (name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$');
```

Mixed case is stored as typed and displayed as typed; only lookup and
uniqueness are case-insensitive.

Because the schema now contains state Prisma did not generate, add a short
comment at the top of the migration saying so, and verify no drift with
`prisma migrate diff` (exit check 4).

### The admin seed

PLAN.md §08 says seed from a migration, so this is a migration, not a
`seed.ts`:

```sql
INSERT INTO users (id, handle, display_name, email, is_admin, created_at)
VALUES (gen_random_uuid(), 'nschneble', 'Nick Schneble',
        'nschneble@users.noreply.github.com', true, now());
```

No SSH key row — 1b adds that, from a key path in the environment. A user
with no keys simply cannot authenticate yet, which is correct for 1a.

### Squawk

Run `npx squawk prisma/migrations/**/*.sql` as part of the exit checks.

### Step 0 — give squawk its facts before silencing anything

A rule that fires because squawk is missing an environmental fact is not a
false positive. It is a correct inference from wrong inputs, and the fix is
the input, not an exclusion. `.squawk.toml` carries two such facts and
**should exist for exactly these**:

```toml
pg_version = "18.0"            # must match the image in compose.yaml
assume_in_transaction = <see Amendment 6 — verify, do not assume>
```

`pg_version` is straightforward: several rules are hazards only on older
majors, and squawk assumes an old default until told otherwise.

`assume_in_transaction` must state what Prisma **actually** does in this
project, which is not what Prisma's documentation implies and has changed
between versions. Determine it empirically — check the Postgres log for
`BEGIN`/`COMMIT` around a migration, and force a mid-file failure to see
whether earlier statements roll back — then set the value to match. A
config fact that is false is worse than no config file at all: it silences
findings on a premise that does not hold, which is the exact failure this
section exists to prevent.

Set both, re-run, and only then triage what remains. Findings that
disappear at this step were never suppressed — they were evaluated
correctly for the first time.

`excluded_rules` must not appear in this file. See "How to silence one".

### Which findings may be silenced

Sort every _remaining_ finding into one of three categories. The category
decides, not a list of named rules — a list can only ever be incomplete.

**1 · Lifecycle artefact.** The rule guards against a hazard that applies
to a _populated_ table, and this table is being created empty in the same
migration. **Excludable**, with the reason stated. Expect this category to
be nearly empty once step 0 is done.

**2 · Capacity ceiling.** The rule guards against exceeding a limit.
**Excludable only when the ceiling is unreachable by construction** — and
the exclusion comment must contain the arithmetic, not an assurance.
`prefer-bigint-over-int` on `repos.next_number` is this case: it is a
per-repo counter of issues plus PRs, against an `int4` ceiling of
2,147,483,647, on a single-person forge. Keep `Int`.

**3 · Correctness.** The rule is catching something that is wrong at row
one, not at row N — a scale that never arrives does not rescue it.
`prefer-timestamp-tz`, `ban-drop-column`, and
`disallowed-unique-constraint` are here, and so is anything else of that
shape. **Never excludable.** A finding means the schema is wrong; fix the
schema.

The line between 2 and 3 is the one that matters: _is this wrong now, or
only wrong past a threshold?_ A naive timestamp is wrong on the first row.
An `int4` counter is correct until it isn't, and here it never isn't.

### How to silence one

**Inline, at the statement**, never in `.squawk.toml`:

```sql
-- squawk-ignore prefer-bigint-over-int
-- int4 ceiling 2,147,483,647 issues+PRs in one repo; unreachable here
ALTER TABLE repos ...
```

An `excluded_rules` entry is inherited by every migration in the project's
future. Silencing `prefer-timestamp-tz` there in 1a would quietly land
`issues.closed_at`, `pull_requests.merged_at`, `releases.created_at`, and
all of `events` as naive timestamps in later phases — the finding would
never fire again to warn you. Inline ignores are scoped to the statement
that earned them and carry their own justification.

So: `.squawk.toml` holds facts and only facts. Silencing happens inline, at
the statement, or not at all.

---

## The `html` tag

The single most security-critical function in the codebase. CLAUDE.md:
_"The `html` tag escapes every interpolation by default; `raw()` is the
explicit opt-out for pre-rendered markdown. Never interpolate unescaped."_

```ts
export class Raw {
  constructor(readonly value: string) {}
}
export function raw(s: string): Raw;
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw;
```

Interpolation rules, exhaustively:

| Value                        | Renders as                                         |
| ---------------------------- | -------------------------------------------------- |
| `Raw`                        | its `.value`, unescaped                            |
| `string`                     | escaped                                            |
| `number`, `bigint`           | `String(v)`, no escaping needed                    |
| `null`, `undefined`, `false` | empty string                                       |
| `true`                       | empty string                                       |
| array                        | each element by these same rules, joined with `""` |
| anything else                | `String(v)`, then escaped                          |

Escape exactly these five, and do it in one pass so `&` cannot be
double-encoded: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`,
`'` → `&#39;`.

`html` returns `Raw`, which is what makes nesting work without double
escaping. Escaping both `"` and `'` is what closes off both quoting styles
for attribute values; do not "optimize" either away.

> **Correction.** An earlier revision of this brief claimed the five-
> character set made interpolation safe in an *unquoted* attribute
> position. It does not, and no five-character set could. An unquoted value
> is also terminated by a space, a tab, a newline, `=`, or a backtick, none
> of which are escaped — so `foo onmouseover=alert(1)` interpolated into
> `<a href=${x}>` renders as a live event handler.
>
> The escape set is correct and stays as it is. The missing half is the
> invariant it depends on: **every attribute value in every template is
> quoted.** Expanding the set instead would mean escaping spaces in body
> text, bloating every page against the 100 KB budget to buy nothing that
> a quote mark does not already buy. No mainstream templating system does
> it that way either.
>
> That invariant is enforced in 1d, where templates first exist, by a
> contract test that scans template source for an interpolation landing in
> an unquoted attribute position. Until then there are no templates and
> nothing to enforce.

> **On the no-unit-tests rule.** CLAUDE.md forbids unit tests, and this is
> not one. `escaping.contract.ts` asserts a security contract — the same
> category as the header and page-weight tests, and one a screenshot cannot
> see. It is the only function in 1a that gets assertions. Do not take it
> as license to test anything else.

Required assertions:

- `html\`<p>${'<script>alert(1)</script>'}</p>\``contains no
  literal`<script`
- `&` in input becomes `&amp;` exactly once, not `&amp;amp;`
- `raw('<b>x</b>')` passes through unescaped
- a nested `html` result is not double-escaped
- `['a', 'b']` joins without separator; `[]` renders empty
- `null`, `undefined`, `false` each render empty — not `"null"`
- `<a href="${'" onmouseover="alert(1)'}">` leaves no unescaped `"`

---

## Config and app

`config.ts` — hand-rolled, ~20 lines, no dependency:

| Var            | Required | Default       |
| -------------- | -------- | ------------- |
| `DATABASE_URL` | yes      | —             |
| `PORT`         | no       | `3000`        |
| `HOST`         | no       | `127.0.0.1`   |
| `NODE_ENV`     | no       | `development` |

Missing `DATABASE_URL` exits non-zero with a message naming the variable.
Read it once at startup into a frozen object; do not touch `process.env`
elsewhere — `prisma.config.ts` is the one exception, since the CLI loads it
outside the app. Fastify's built-in pino covers logging; do not add one.

`db.ts` wires the adapter rather than passing a URL:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: config.databaseUrl });
export const db = new PrismaClient({ adapter });
```

One `PrismaClient` for the process, created once at module load. The
adapter owns connection pooling, so do not construct a `Pool` yourself.

`GET /health` returns `200` and `{"status":"ok"}` as `application/json`. It
does **not** check the database: Phase 2 flips this endpoint to 503 during
SIGTERM drain, so it reports whether this process should receive traffic,
not whether Postgres is up. Keep it dependency-free and synchronous.

### Security headers

Set on every response via an `onSend` hook:

```
Content-Security-Policy: default-src 'none'; img-src 'self' data:;
  style-src 'self'; font-src 'self'; form-action 'self';
  base-uri 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

No `script-src` beyond `default-src 'none'` — zero client JS on the
critical path is a budget, and the CSP is where it becomes enforceable.
HSTS is Caddy's job in Phase 2, not the app's. Send it as one header string
so `headers.contract.ts` can assert on it exactly.

---

## Exit criteria

Implement these as `scripts/verify-phase-1a.sh`, printing `PASS`/`FAIL` per
check and exiting non-zero if any fail. Each must be mechanically decidable
— no judgment calls.

1. `npm ci` completes clean
2. `npm run build` exits 0 with zero TypeScript errors under `strict: true`
3. `docker compose up -d` brings Postgres up healthy
4. `npx prisma migrate deploy` applies cleanly to an **empty** database
5. `npx prisma migrate diff --from-config-datasource --to-schema
   prisma/schema.prisma --exit-code` reports no drift. **Must run after
   check 4** — it diffs the migrated database against the schema file. See
   "Expected drift" below before implementing this one.
6. Exactly one user row exists, `handle = 'nschneble'`, `is_admin = true`
7. Inserting repo `Foo` then repo `foo` fails on `repos_name_lower_key` —
   proves the functional index is real
8. Inserting a repo named `-bad` fails on `repos_name_format`
9. `curl -i localhost:3000/health` → `200`, `application/json`, and all
   three security headers present with the exact values above
10. `node --test dist/test/` passes with zero failures
11. Every `.ts` file under `src/` and `test/` has the SPDX line first
12. `package.json` dependencies are a subset of the budget above — and `pg`
    is **not** among the direct dependencies
13. `prisma/schema.prisma` contains no `url =` line, and `npx prisma
    validate` exits 0
14. `git grep -n "shell: true"` returns nothing
15. `npx squawk prisma/migrations/**/*.sql` exits 0
16. Every timestamp column is `timestamp with time zone`. Query
    `information_schema.columns` for `data_type` across all four tables and
    assert zero rows of type `timestamp without time zone`
17. `.squawk.toml` contains no `excluded_rules` key, and its `pg_version`
    major matches the Postgres image tag in `compose.yaml` — these drift
    silently, and squawk lints against the wrong version when they do

### Expected drift — resolve this empirically

Check 5 is in tension with a decision made elsewhere in this brief. The
functional unique index on `lower(name)` and the `repos_name_format` CHECK
constraint are deliberately hand-written SQL that the Prisma schema
language cannot express. Whether `migrate diff` reports them as drift
depends on whether its engine models those object types at all, and that is
a question to answer by running it rather than reasoning about it.

Run the diff and follow whichever case you land in:

- **Empty diff** — the engine does not model them. Check 5 stands as
  written. Nothing further to do.
- **Diff contains only the functional index and/or the CHECK constraint** —
  this is drift by design. Change check 5 to assert the diff output
  mentions _nothing but_ those two objects, name them explicitly in the
  assertion, and put a comment in the script explaining that they are
  intentional and unrepresentable. A bare "ignore drift" is not acceptable.
- **Diff contains anything else** — real drift. Fix the schema or the
  migration; do not adjust the check.

Report which case occurred in your handoff notes.

Check 7 is the one worth being careful about — it is easy to write a
migration that looks right and produces an index on `name`. Prove it with
an actual failing insert, not by reading the SQL.

---

## Handoff notes to write when done

Append to your final message, not to a file:

- Resolved versions of every dependency
- Any place CLAUDE.md and this brief disagreed, and which you followed
- Anything you wanted to add and did not, with the reason
- Any exit check you could not make mechanical, and why
- The squawk rules excluded, if any, and the justification for each

If something here turns out to be wrong — a Prisma API that does not exist,
a squawk rule that cannot be excluded narrowly — **stop and say so rather
than working around it**. A workaround discovered at review time costs more
than a question asked during the build.

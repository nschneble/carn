# Phase 1a · Foundation

_Schema, app skeleton, and the escaping primitive. No git anywhere._

This is the first of four briefs that together make up Phase 1 of
`docs/PLAN.md` §08. The split exists so each handoff has a mechanical exit
check and a human review before the next one starts.

| Sub-phase | Scope | Exit |
|---|---|---|
| **1a** | Schema, Fastify skeleton, `html` tag | This document |
| 1b | SSH listener, auth against `ssh_keys`, push-to-create | Push a real repo |
| 1c | Anonymous smart-HTTP read | Anonymous clone |
| 1d | Browsing views + the design system | The page looks good |

**Read `.claude/CLAUDE.md` first, in full.** It holds the constraints,
the stack, the naming registers, and the verified gotchas. This brief does
not repeat them. Where the two disagree, CLAUDE.md wins and you should say
so rather than picking one.

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

- **Node 24** pinned in Compose and in `engines`. Set
  `"engines": { "node": ">=24" }` — the dev laptop runs 26 and both must
  work.
- **TypeScript compiled with `tsc`**, `strict: true`, no bundler. Vite is
  explicitly out; so is any loader-based TS execution. Build to `dist/`
  with `rootDir: "."` so `dist/src/` and `dist/test/` both exist.
- **ESM.** `"type": "module"`, `module: "nodenext"`,
  `moduleResolution: "nodenext"`. Use explicit `.js` extensions in relative
  imports, as nodenext requires.
- **`node --test`** as the test runner. Jest and Vitest are explicitly out
  in CLAUDE.md. Tests run against compiled output: `node --test dist/test/`.
- Install **latest stable** of each dependency rather than pinning to a
  version named here, and report the resolved versions in your handoff
  notes.

### Dependency budget

Runtime: `fastify`, `@prisma/client`. Dev: `prisma`, `typescript`,
`@types/node`, `squawk-cli`.

That is the entire list for 1a. CLAUDE.md's rule applies: **stop and ask**
before adding anything else, including anything that looks obviously
harmless like `dotenv` (Node has `--env-file`) or `zod` (the config parser
below is twenty lines).

---

## File manifest

Create exactly these. Every `.ts` file starts with
`// SPDX-License-Identifier: AGPL-3.0-or-later` as its first line.

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
.squawk.toml                only if squawk needs exclusions
tsconfig.json
```

`app.ts` returning an unstarted app and `index.ts` doing the listening is
not ceremony — the contract tests need to boot the app in-process.

---

## Schema

Four tables. Field names follow `docs/PLAN.md` §05 exactly. Postgres names
are `snake_case` via `@map`; TypeScript sees `camelCase`.

```prisma
model User {
  id          String      @id @default(uuid()) @db.Uuid
  handle      String      @unique
  displayName String      @map("display_name")
  email       String
  isAdmin     Boolean     @default(false) @map("is_admin")
  createdAt   DateTime    @default(now()) @map("created_at")
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
  createdAt   DateTime  @default(now()) @map("created_at")
  lastUsedAt  DateTime? @map("last_used_at")
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
  createdAt     DateTime    @default(now()) @map("created_at")
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

Both go into the generated migration SQL by hand, after
`prisma migrate dev --create-only` and before applying:

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

Expect findings on an initial migration that are false positives against
empty tables — index creation without `CONCURRENTLY` is the usual one. If
so, add `.squawk.toml` excluding **only** those specific rules, each with a
comment saying why it does not apply to a table created in the same
migration. Do not silence squawk globally, and do not exclude
`ban-drop-column` or `disallowed-unique-constraint`.

---

## The `html` tag

The single most security-critical function in the codebase. CLAUDE.md:
*"The `html` tag escapes every interpolation by default; `raw()` is the
explicit opt-out for pre-rendered markdown. Never interpolate unescaped."*

```ts
export class Raw { constructor(readonly value: string) {} }
export function raw(s: string): Raw
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw
```

Interpolation rules, exhaustively:

| Value | Renders as |
|---|---|
| `Raw` | its `.value`, unescaped |
| `string` | escaped |
| `number`, `bigint` | `String(v)`, no escaping needed |
| `null`, `undefined`, `false` | empty string |
| `true` | empty string |
| array | each element by these same rules, joined with `""` |
| anything else | `String(v)`, then escaped |

Escape exactly these five, and do it in one pass so `&` cannot be
double-encoded: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`,
`'` → `&#39;`.

`html` returns `Raw`, which is what makes nesting work without double
escaping. Escaping both `"` and `'` is what makes it safe in an unquoted-
adjacent attribute position; do not "optimize" either away.

> **On the no-unit-tests rule.** CLAUDE.md forbids unit tests, and this is
> not one. `escaping.contract.ts` asserts a security contract — the same
> category as the header and page-weight tests, and one a screenshot cannot
> see. It is the only function in 1a that gets assertions. Do not take it
> as licence to test anything else.

Required assertions:

- `html\`<p>${'<script>alert(1)</script>'}</p>\`` contains no literal `<script`
- `&` in input becomes `&amp;` exactly once, not `&amp;amp;`
- `raw('<b>x</b>')` passes through unescaped
- a nested `html` result is not double-escaped
- `['a', 'b']` joins without separator; `[]` renders empty
- `null`, `undefined`, `false` each render empty — not `"null"`
- `<a href="${'" onmouseover="alert(1)'}">` leaves no unescaped `"`

---

## Config and app

`config.ts` — hand-rolled, ~20 lines, no dependency:

| Var | Required | Default |
|---|---|---|
| `DATABASE_URL` | yes | — |
| `PORT` | no | `3000` |
| `HOST` | no | `127.0.0.1` |
| `NODE_ENV` | no | `development` |

Missing `DATABASE_URL` exits non-zero with a message naming the variable.
Read it once at startup into a frozen object; do not touch `process.env`
elsewhere. Fastify's built-in pino covers logging — do not add a logger.

`GET /health` returns `200` and `{"status":"ok"}` as
`application/json`. It does **not** check the database: Phase 2 flips this
endpoint to 503 during SIGTERM drain, so it reports whether this process
should receive traffic, not whether Postgres is up. Keep it dependency-free
and synchronous.

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
— no judgement calls.

1. `npm ci` completes clean
2. `npm run build` exits 0 with zero TypeScript errors under `strict: true`
3. `docker compose up -d` brings Postgres up healthy
4. `npx prisma migrate deploy` applies cleanly to an **empty** database
5. `npx prisma migrate diff --from-migrations ... --exit-code` reports no
   drift between schema and migrations
6. Exactly one user row exists, `handle = 'nschneble'`, `is_admin = true`
7. Inserting repo `Foo` then repo `foo` fails on
   `repos_name_lower_key` — proves the functional index is real
8. Inserting a repo named `-bad` fails on `repos_name_format`
9. `curl -i localhost:3000/health` → `200`, `application/json`, and all
   three security headers present with the exact values above
10. `node --test dist/test/` passes with zero failures
11. Every `.ts` file under `src/` and `test/` has the SPDX line first
12. `package.json` dependencies are a subset of the budget above
13. `git grep -n "shell: true"` returns nothing
14. `npx squawk prisma/migrations/**/*.sql` exits 0

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

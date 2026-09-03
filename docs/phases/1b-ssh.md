# Phase 1b · The SSH listener

_Authenticated push and clone against real repos on disk. No HTTP, no pages._

Second of four briefs making up Phase 1 of `docs/PLAN.md` §08.

| Sub-phase | Scope | State |
|---|---|---|
| 1a | Schema, Fastify skeleton, `html` tag | Done — PR #1 |
| **1b** | SSH listener, auth against `ssh_keys`, push-to-create | This document |
| 1c | Anonymous smart-HTTP read | Next |
| 1d | Browsing views + the design system | After that |

**Read `.claude/CLAUDE.md` first, in full**, then `docs/STACK.md`. This
brief does not repeat them. Where any two disagree, CLAUDE.md wins and you
should say so rather than choosing quietly.

---

## Version reconnaissance

Verified at the time of writing. If `npm install` resolves something
outside these majors, **stop and report it** rather than adapting the code
— that failure mode cost 1a two rounds.

| Package | Verified | Major | Note |
|---|---|---|---|
| `ssh2` | 1.17.0 | 1 | Proven end-to-end in Phase 0 on this hardware. The three gotchas in CLAUDE.md are confirmed against exactly this version. |
| `@types/ssh2` | 1.15.5 | 1 | `ssh2` ships no types of its own. Dev dependency. |

`ssh2` pulls `asn1` and `bcrypt-pbkdf` as real dependencies, and `nan` +
`cpu-features` as **optional** ones that compile native code. Let them fail
if they fail — `ssh2` falls back to pure JS and the fallback is what Phase
0 exercised. Do not add build toolchain to make them succeed, and do not
add `--no-optional` either; npm tolerates the failure already.

## What 1b is

The Phase 0 spike, made real. That spike proved the transport and is the
starting point, not a reference to admire — four things change:

- The single hardcoded public key becomes a lookup against `ssh_keys`
- The constant repo path becomes name → UUID → disk path
- Pushing to a name that does not exist creates the repo
- Writes are authorized; reads over SSH are not gated, since everything is
  public

At the end, `git clone` and `git push` work against a real repo owned by a
real row, from a key in the database.

## What 1b is not

- Smart-HTTP, `info/refs`, or anything Fastify serves — that is 1c
- Any HTML page, template, or stylesheet — that is 1d
- `carn repo rename`. The plan puts rename in Phase 1, but there is no
  interface to invoke it from until 1d's forms or Phase 6's CLI. Deferred,
  deliberately. Do not build a bespoke one.
- The `post-receive` mirror hook — Phase 2
- Any CLI beyond the single key-add script below
- Rate limiting, `git gc` scheduling, repo size limits — later phases
- New tables. `ssh_keys`, `repos`, and `repo_grants` already exist.

## Standing rules carried from 1a

These are project conventions now, not 1a trivia:

- **Every migration file starts with `BEGIN;` and ends with `COMMIT;`.**
  Prisma opens no transaction of its own. This is mechanical and checked.
- `.squawk.toml` holds environmental facts only. Silencing is inline
  `-- squawk-ignore` at the statement, with the reason.
- **The init migration's `require-lock-timeout` /
  `require-statement-timeout` ignore does not carry forward.** Its
  justification was that the migration created every table it touched. Any
  migration altering an existing table needs those timeouts for real. Do
  not copy that comment block.
- Findings sort into lifecycle artefact / capacity ceiling / correctness.
  Correctness findings are never silenced.

---

## Dependency budget

Adds `ssh2` (runtime) and `@types/ssh2` (dev) to what 1a shipped —
`fastify`, `@prisma/client`, `@prisma/adapter-pg` at runtime; `prisma`,
`typescript`, `@types/node`, `squawk-cli`, `@biomejs/biome` in dev.
Nothing else. Update the budget in `verify-phase-1a.sh` if you add to it,
so the two scripts cannot disagree.

Fingerprints, host keys, and constant-time comparison all come from
`node:crypto`. No `sshpk`, no `node-forge`.

## File manifest

Every `.ts` file starts with `// SPDX-License-Identifier: AGPL-3.0-or-later`.

```
src/
  ssh/
    server.ts         the ssh2 Server: auth, session, exec
    auth.ts           fingerprint → SshKey+User, signature verification
    exec.ts           parse the git command, authorize, spawn
    hostkey.ts        load or generate, persisted
  repos/
    resolve.ts        name → repo row; repo row → disk path
    create.ts         push-to-create: row + bare repo + git config
  git/
    spawn.ts          the guarded spawn wrapper (see below)
scripts/
  add-key.ts          add an SSH key to the admin user
  verify-phase-1b.sh  the exit checks
test/
  contract/
    ssh-transport.contract.ts
```

`src/index.ts` starts both the Fastify app and the SSH server, and shuts
both down on `SIGTERM`. Keep `buildApp()` returning an unstarted app as it
does now — the SSH server follows the same shape, a `buildSshServer()` that
does not listen.

---

## Configuration

Added to `config.ts`, same fail-fast `read()` it already uses:

| Var | Required | Default |
|---|---|---|
| `CARN_SSH_PORT` | no | `2222` |
| `CARN_SSH_HOST` | no | `127.0.0.1` |
| `CARN_SSH_HOST_KEY` | no | `./local/ssh_host_ed25519_key` |
| `CARN_REPO_ROOT` | no | `./local/repos` |

Defaults are dev defaults; `local/` is already gitignored. Production
values arrive in Phase 2, which also decides whether the public listener
sits on 22 — that decision affects only the clone URL's shape and nothing
in this phase, so do not anticipate it.

While you are in `config.ts`: `Number(read('PORT', '3000'))` yields `NaN`
for a non-numeric value and passes it to `listen`. Every other path in that
file fails loudly. Make the numeric ones fail loudly too, and apply the
same to `CARN_SSH_PORT`.

## The host key

`ssh2` needs a host key, and it **must survive restarts** — a changing host
key produces the `REMOTE HOST IDENTIFICATION HAS CHANGED` wall that stops
clients dead.

`hostkey.ts`: read `CARN_SSH_HOST_KEY`; if absent, generate an ed25519 key
via `crypto.generateKeyPairSync`, write it with mode `0600`, and log that
it did so. Refuse to start if the file exists with looser permissions than
`0600` — say what the mode is and what it should be.

## Authentication

Phase 0's flow, with the key coming from Postgres. The two-phase gotcha is
unchanged and is the thing most likely to be got wrong: **the first
callback has no `ctx.signature` and must be accepted.**

1. Reject any `ctx.method` other than `publickey`, offering `['publickey']`
2. Reject any username other than `git`, with a message naming `git` — the
   username carries no identity, the key does, but a typo should fail
   legibly rather than as a mysterious auth failure
3. Compute the fingerprint of `ctx.key.data` and look up `ssh_keys` by it
4. No row → reject
5. `ctx.signature === undefined` → `ctx.accept()`, the probe
6. Otherwise `parseKey(row.publicKey)`, and reject unless **both** the
   stored blob equals `ctx.key.data` under `crypto.timingSafeEqual` **and**
   `verify(ctx.blob, ctx.signature, ctx.key.algo)` passes
7. Accept, and update `last_used_at` without awaiting it — a slow write
   must not stall the handshake

Step 6's blob comparison is redundant against a SHA-256 collision and is
there anyway: it costs nothing and it also catches a corrupted row.

**Fingerprint format** is `ssh-keygen -lf`'s: `SHA256:` followed by the
base64 of the SHA-256 of the raw public key blob, with `=` padding
stripped. Store it that way so a human can match it by eye, and so exit
check 6 can compare against `ssh-keygen` directly.

Session requests other than `exec` are refused: `shell`, `pty`, and
`subsystem` all reject.

## Repo resolution

The one rule that matters, from CLAUDE.md: **no user-controlled string ever
reaches a filesystem path.**

Parse the exec command with the Phase 0 regex, then normalize what the
client asked for: strip a leading `/`, strip a trailing `.git`. What
remains is a candidate name.

Validate it against `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` — the same pattern
as the `repos_name_format` CHECK constraint — and reject before touching
the database. That regex admits no `/` and no `.` leader, so traversal is
not a case to handle; it is a case that cannot be expressed. Do not also
write a `..` check, which would imply the regex is not trusted.

Look up with `WHERE lower(name) = lower($1)`, matching the functional
unique index. The row's `id` gives the path:

```
<CARN_REPO_ROOT>/<uuid[0:2]>/<uuid>.git
```

Derive it from the UUID only. Never join a name into a path, even a
validated one.

## Authorization

- `git-upload-pack` — no authorization. Everything is public, and the key
  only established who is asking.
- `git-receive-pack` — allowed if the user is `repos.owner_id`, or holds a
  `repo_grants` row of `write` or `admin`, or is `users.is_admin`.

A rejected push writes one line to the channel's stderr saying the user has
no write access to that repo, and exits non-zero. Per CLAUDE.md's voice:
what happened, then what to do, no apology.

## Push-to-create

On `git-receive-pack` against a name with no row: create it, owned by the
authenticated user. On `git-upload-pack` against a missing name: refuse,
and say the repo does not exist — never create on read.

Ordering matters. Insert the row inside a transaction, then create the
directory and run `git init --bare` inside that same transaction's scope;
if either throws, the transaction rolls back. That leaves an orphaned
directory under a UUID nothing references, which is the harmless failure —
the reverse, a row pointing at nothing, is not.

Then apply the git config from `docs/PLAN.md` §04, which exists because the
defaults are wrong for a small shared-CPU box:

```
pack.threads=1
pack.windowMemory=64m
receive.maxInputSize=100m
receive.autogc=false
core.logAllRefUpdates=true
```

Set `HEAD` to the row's `default_branch`, so the first push of `main`
lands on a repo whose HEAD already points there.

## Spawning git

`git/spawn.ts` is the only place in the codebase that calls `spawn`, and
every rule in CLAUDE.md's *Git subprocess rules* applies to it. The ones
with teeth here:

- Args array, **never `shell: true`**
- A hard timeout, and kill the child when the SSH channel closes
- A global concurrency semaphore — `pack-objects` is the spiky single-core
  workload this box handles worst, and two simultaneous clones of a large
  repo should queue rather than compete
- `GIT_PROTOCOL` forwarded from the session env, remembering that the
  property is `info.val`

And Phase 0's third gotcha, which is not in CLAUDE.md and cost the most
time to find: **`child.stdout.pipe(stream, { end: false })`**. Without
`{ end: false }` the channel closes before the exit status is sent, ssh
gives up with 255, and git reports `failed to push some refs` on a push
that fully succeeded. If you see that symptom, it is this and nothing else.

## The key-add script

`npm run key:add -- <path-to-pubkey> [name]` reads a public key file,
computes the fingerprint, and inserts a row for the admin user. Idempotent
on fingerprint — re-running with the same key updates the name rather than
erroring.

This is a maintenance script, not the beginning of the CLI. No argument
parsing library, no subcommands, no interactive prompts.

---

## Exit criteria

`scripts/verify-phase-1b.sh`, printing `PASS`/`FAIL` per check, exiting
non-zero if any fail.

**It must be idempotent.** Run it twice back to back, from a dirty
development database, and both runs give identical results. 1a's script
failed this — check 4 demanded an empty database, check 7 left a repo row
behind, and the remedy it suggested re-applied the migrations it was
trying to escape. It was fixed by giving those checks a scratch database
created and dropped by the script; **follow that same pattern here**, and
read `verify-phase-1a.sh` before writing this one.

1b makes it harder, because state now lands in two places. A scratch
database covers the rows; the repos on disk need a temporary
`CARN_REPO_ROOT` under `mktemp -d`, removed on exit through the same trap.
The SSH daemon is a third: bind it to an ephemeral port, and kill it in
cleanup rather than leaving a listener behind on a failed run.

1. `npm ci && npm run build` — zero errors under `strict`
2. `npm run key:add` inserts a row; its `fingerprint` matches
   `ssh-keygen -lf` byte for byte
3. `git push` to a name with no row succeeds, exits 0
4. That push created exactly one `repos` row, and a bare repo at
   `<root>/<uuid[0:2]>/<uuid>.git` — assert the path is derived from the
   row's `id`
5. The new repo's `HEAD` points at its `default_branch`, and the five git
   config values are set
6. `git clone` of that repo returns the pushed content
7. Protocol v2 negotiated on clone
8. A second push to the same name updates it and creates **no** second row
9. `last_used_at` on the key is non-null and later than its `created_at`
10. A key with no `ssh_keys` row is rejected — ssh exits 255
11. A user with a valid key but no write grant, pushing to a repo owned by
    someone else, is rejected with a message naming the missing access, and
    no ref is updated. Insert the second user and key directly as fixture
    setup; do not add a migration for it
12. `git-upload-pack` against a name with no row fails and creates nothing
    — assert no row and no directory afterward
13. A name failing the format regex is rejected before any database query
    and creates nothing. Cover at least `../etc`, `-x`, `.hidden`, and a
    65-character name
14. `ssh git@host` (shell) is refused; `ssh git@host id` exits non-zero
    with the refusal on stderr
15. Restarting the server leaves the host key fingerprint unchanged
16. A host key file at mode `0644` prevents startup, with a message naming
    the mode
17. `git grep -n "shell: true"` returns nothing
18. Every `.ts` under `src/` and `test/` has the SPDX line first
19. `package.json` dependencies are a subset of 1a's plus `ssh2` and
    `@types/ssh2`
20. Every `prisma/migrations/*/migration.sql` starts with `BEGIN;` and ends
    with `COMMIT;`
21. `npx squawk prisma/migrations/**/*.sql` exits 0
22. `./scripts/verify-phase-1a.sh` still passes in full — 1b must not
    regress 1a
23. Running `./scripts/verify-phase-1b.sh` twice in succession gives the
    same result both times, and afterwards leaves behind no
    `carn_verify_%` database, no rows in `repos` or `ssh_keys` beyond the
    admin seed, and no directory under the temporary repo root

Check 11 is the one worth building carefully. It is the only check that
proves authorization exists rather than assuming it, and it is easy to
write a version that passes because the push failed for an unrelated
reason. Assert the specific message and the unchanged ref, not just a
non-zero exit.

## Handoff notes

- Resolved versions of `ssh2` and `@types/ssh2`
- Whether the optional native dependencies built or fell back
- Any place CLAUDE.md, `docs/STACK.md`, and this brief disagreed
- Anything you wanted to add and did not, with the reason
- Any exit check you could not make mechanical

If something here is wrong about the world — an `ssh2` API that has moved,
a Prisma method that does not exist — **stop and say so.** Five of 1a's six
amendments were defects in the brief rather than the code. That ratio is
the expected one; surfacing them early is the process working, not a
failure of it.

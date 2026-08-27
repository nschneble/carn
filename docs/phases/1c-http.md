# Phase 1c · Anonymous smart-HTTP

_Clone over HTTP without a key. No pages, no push._

Third of four briefs making up Phase 1 of `docs/PLAN.md` §08.

| Sub-phase | Scope | State |
|---|---|---|
| 1a | Schema, Fastify skeleton, `html` tag | Merged — PR #1 |
| 1b | SSH listener, auth, push-to-create | Merged — PR #2 |
| **1c** | Anonymous smart-HTTP read | This document |
| 1d | Browsing views + the design system | Next |

**Read `.claude/CLAUDE.md` first, in full**, then `docs/STACK.md`. This
brief does not repeat them. Where any two disagree, CLAUDE.md wins and you
should say so rather than choosing quietly.

---

## Version reconnaissance

Verified 2026-08-26. If `npm install` resolves outside these majors,
**stop and report it** rather than adapting the code.

| Package | Verified | Major | Note |
|---|---|---|---|
| `fastify` | 5.12.1 | **5** | Already installed. The raw content-type parser below is a v5 API. |

**No new dependencies.** Gunzip comes from `node:zlib`. If you find
yourself wanting `@fastify/compress`, stop — it solves response
compression, which is not the problem here.

## What 1c is

Two routes that let `git clone` and `git fetch` work over HTTP with no
credential at all, because every repo is public.

```
GET  /r/:repo/info/refs?service=git-upload-pack
POST /r/:repo/git-upload-pack
```

That is the entire surface. Both shell out to `git upload-pack` through
the wrapper 1b already built.

## What 1c is not

- **`git-receive-pack` over HTTP. Not now, not ever.** Push is SSH.
  CLAUDE.md's `Never` list covers passwords and tokens, and HTTP push
  without them would be anonymous write. Both routes must refuse it by
  name, pointing at SSH.
- Any HTML page, template, or stylesheet — that is 1d
- `/r/:repo/archive/:rev.tar.gz` — the tightest rate-limit zone in the
  whole design, and nothing needs it yet
- Dumb HTTP (`/objects/...`) — smart protocol only
- Rate limiting, caching layers, ETags — later phases
- New tables, new migrations
- Any change to the SSH path. If 1b needs a fix to make 1c work, say so
  rather than editing it in passing.

## Standing rules

- Every migration file starts with `BEGIN;` and ends with `COMMIT;`
- `.squawk.toml` holds environmental facts only; silencing is inline
- **The init migration's `require-lock-timeout` /
  `require-statement-timeout` ignore does not carry forward**
- Findings sort into lifecycle artefact / capacity ceiling / correctness;
  correctness findings are never silenced
- The verify script must be idempotent — see Exit criteria

---

## Reuse, do not rebuild

1b built the pieces. 1c wires them to HTTP.

- **`spawnGit(options)` from `src/git/spawn.ts`** is the only way to run
  git. It returns `{ stdin, stdout, stderr, done }` and enforces the
  global semaphore. **That semaphore must stay global** — one limit
  across SSH and HTTP, not one each. Two clones over HTTP and two over
  SSH is four `pack-objects` on a shared-CPU box.
- **`resolveRepo(target)` from `src/repos/resolve.ts`** does name
  validation and the `lower(name)` lookup. Do not write a second
  validator; do not join a name into a path.
- Mirror `exec.ts`'s child lifecycle: an `AbortController` aborted on
  client disconnect, passed as `signal`. On HTTP that is
  `reply.raw.on("close", ...)` **guarded by `!reply.raw.writableFinished`**.
  Not `request.raw`: its `close` fires as soon as the request body is
  consumed — measured at 16ms against 315ms for the response — and
  `req.destroyed` is true whether the client left or not, so it cannot
  tell the two apart. It matters more here than over SSH; a browser or
  crawler abandoning a clone is routine.

## The three corrections

CLAUDE.md's *Smart HTTP* section states these. They are the whole reason
this phase is more than an afternoon.

**1 · The service header.** `git upload-pack --advertise-refs` does not
emit it. Under protocol v0 you prepend it yourself:

```
001e# service=git-upload-pack\n
0000
```

`001e` is the pkt-line length, 30 bytes: 4 for the length prefix plus 26
for the line. Under `Git-Protocol: version=2` there is **no** service
header — the body begins `000eversion 2\n` and prepending anything
corrupts the stream. Branch on the request header, not on a guess.

**2 · Gzipped request bodies.** Not an edge case. The client compresses
the POST body once a repo has accumulated refs, so this works on a fresh
repo and breaks later, in production, on the repo you care about. If
`Content-Encoding: gzip`, pipe through `zlib.createGunzip()` before git
sees it.

**3 · Fastify eats the stream.** Register a raw content-type parser for
`application/x-git-upload-pack-request` that passes the payload through
untouched. Without it Fastify tries to parse a binary body and clones
fail confusingly — the request never reaches your handler in a usable
form.

## Responses

Both endpoints are uncacheable. Git's own server sends all three of
these, and intermediaries misbehave without them:

```
Cache-Control: no-cache, max-age=0, must-revalidate
Expires: Fri, 01 Jan 1980 00:00:00 GMT
Pragma: no-cache
```

Content types: `application/x-git-upload-pack-advertisement` for the
advertisement, `application/x-git-upload-pack-result` for the POST.

1a's `onSend` hook adds CSP, `nosniff`, and `Referrer-Policy` to every
response. Leave it alone — CSP is inert on a binary body, `nosniff` is
correct, and carving out an exception adds a branch for no gain.

`GIT_PROTOCOL` is forwarded through `spawnGit`'s `gitProtocol` option,
from the `Git-Protocol` request header. Pass the header value through;
do not synthesise it.

## Refusing push

Two places, both explicit:

- `GET /r/:repo/info/refs?service=git-receive-pack` → refuse
- `POST /r/:repo/git-receive-pack` → refuse, if the route exists at all

The message names SSH and gives the working remote URL shape. Per
CLAUDE.md's voice: what happened, then what to do. A bare 403 sends
someone to check their credentials for a thing that has none.

---

## Exit criteria

`scripts/verify-phase-1c.sh`, printing `PASS`/`FAIL` per check, exiting
non-zero if any fail.

**It must be idempotent**, on the pattern 1a and 1b settled: a scratch
database created and dropped by the script, a `mktemp -d` repo root, an
ephemeral port, all cleaned up through one trap. Read
`verify-phase-1b.sh` before writing this one.

1. `npm ci && npm run build` — zero errors under `strict`
2. `git clone` over HTTP of a seeded repo succeeds and the content matches
3. Protocol **v2** negotiated — assert `version 2` in a packet trace
4. Protocol **v0** also works: `-c protocol.version=0` clones successfully
   and the response begins with the `001e# service=` header
5. Under v2 the response does **not** carry the service header — this is
   the corruption case, and it must be asserted, not assumed
6. A **gzipped** POST body is accepted. Send one directly with
   `Content-Encoding: gzip` rather than hoping git produces one
7. `git ls-remote` over HTTP lists the same refs as over SSH
8. `git push` over HTTP fails, and the message names SSH
9. `GET /info/refs?service=git-receive-pack` refuses, naming SSH
10. Both endpoints send all three no-cache headers and the correct
    `Content-Type`
11. A nonexistent repo returns 404 and creates nothing — assert no row and
    no directory afterward
12. An invalid repo name is refused before any database query. Cover
    `../etc`, `-x`, `.hidden`, and a 65-character name
13. A client disconnecting mid-clone kills the git child — assert no
    surviving `upload-pack` process for the scratch repo root
14. The concurrency limit is shared: `gitConcurrency` has exactly one
    exported definition, neither transport builds a second `Semaphore`, and
    both reach the one limit only through `spawnGit`, never by importing
    the constant directly
15. `git grep` finds no shell-enabled spawn — **use 1a's scoped form**,
    path-limited to `src test scripts prisma`, with a positive control.
    The literal string appears in CLAUDE.md and in these briefs, so an
    unscoped grep can never pass
16. Every `.ts` under `src`, `test`, and `scripts` opens with the SPDX line
17. `package.json` dependencies are unchanged from 1b
18. `npx squawk prisma/migrations/**/*.sql` exits 0
19. `./scripts/verify-phase-1a.sh` and `./scripts/verify-phase-1b.sh` both
    still pass in full
20. Running `./scripts/verify-phase-1c.sh` twice in succession gives the
    same result both times, leaving no `carn_verify_%` database, no rows
    beyond the admin seed, and no directory under the temporary repo root

Checks 4, 5, and 6 are the ones worth building carefully. Each covers a
correction that fails *later* rather than immediately — v0 clients are
rare until one appears, and gzip only starts once a repo grows. A version
of this phase that passes checks 2 and 7 alone would look finished and
be broken in production.

## Handoff notes

- Any place CLAUDE.md, `docs/STACK.md`, and this brief disagreed
- Anything you wanted to add and did not, with the reason
- Any exit check you could not make mechanical
- Whether `git` ever actually sent you a gzipped body during testing, or
  whether check 6 is the only thing exercising that path

If something here is wrong about the world — a Fastify API that has moved,
a pkt-line length that is off by one — **stop and say so.** Five of 1a's
six amendments and several of 1b's were defects in the brief rather than
the code. Surfacing them early is the process working.

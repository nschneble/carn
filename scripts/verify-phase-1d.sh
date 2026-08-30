#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Phase 1d exit checks, from docs/phases/1d-design.md. Prints PASS or FAIL
# for each of the 23 checks and exits non-zero if any fail. Reads
# DATABASE_URL from the environment, falling back to ./.env. Check 21 runs
# 1a, 1b and 1c, and 1c runs 1a and 1b again, so a full run takes minutes.

# not set -e: this runs commands expected to fail and reads their status
set -uo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

readonly EXPECTED_CHECKS=23
readonly REPO_NAME=verify1d
readonly BARE_NAME=bare1d
readonly ABSENT_NAME=absent1d
readonly DEFAULT_ROOT=./local/repos
readonly PAGE_BUDGET=102400
readonly SPAWN_BUDGET=12
readonly SSH_FLAGS="-o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=5"
readonly CSP="default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
# as served: error-page.ts writes an apostrophe and the html tag escapes it
readonly NO_REPO="There&#39;s no repo named $ABSENT_NAME on this server."
readonly BAD_NAME="That URL doesn&#39;t carry a repo name this server can look up."
readonly NO_README="No README yet. A README.md at the root of main is rendered here, under the file tree."
readonly REL='rel="nofollow ugc"'

work=$(mktemp -d) || work=""
if [ -z "$work" ]; then
  echo "verify-phase-1d: gave no temp directory" >&2
  exit 1
fi
readonly work
readonly log="$work/results"
readonly repo_root="$work/repos"
readonly host_key="$work/ssh_host_ed25519_key"
readonly seed="$work/seed"
readonly shim="$work/shim"
readonly spawn_log="$work/spawns"
: > "$log"

# a hermetic client: the developer's protocol.version or insteadOf would
# otherwise decide what the seeding pushes actually send
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_GLOBAL="$work/gitconfig"
printf '[user]\n\tname = Carn Verify\n\temail = verify@carn.invalid\n[commit]\n\tgpgsign = false\n' \
  > "$GIT_CONFIG_GLOBAL"

daemon_pid=""
http_port=""
ssh_port=""

stop_daemon() {
  [ -n "$daemon_pid" ] || return 0
  kill "$daemon_pid" 2>/dev/null
  wait "$daemon_pid" 2>/dev/null
  daemon_pid=""
}

cleanup() {
  stop_daemon
  drop_scratch
  rm -rf "$work"
}
# signalled, exit rather than resume: a handler alone returns to the run
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# the verdict derives from this log, so a deleted FAIL trips the count
record() {
  printf '%s %s\n' "$1" "$2" >> "$log"
  printf '%-4s  %2d. %s\n' "$1" "$2" "$3"
  if [ -n "${4:-}" ]; then
    printf '%s\n' "$4" | sed 's/^/         /'
  fi
  return 0
}

psql_dev() {
  psql "$DATABASE_URL" --no-psqlrc --quiet --tuples-only --no-align "$@"
}

psql_scratch() {
  psql "$scratch_url" --no-psqlrc --quiet --tuples-only --no-align "$@"
}

require_db() {
  if [ -z "${DATABASE_URL:-}" ]; then
    record FAIL "$1" "$2" "DATABASE_URL is not set. Copy .env.example to .env, or export it."
    return 1
  fi
  return 0
}

require_build() {
  if [ "$build_ok" != 1 ]; then
    record FAIL "$1" "$2" "the build did not produce dist, see check 1"
    return 1
  fi
  return 0
}

require_scratch() {
  if [ "$scratch_ok" != 1 ]; then
    record FAIL "$1" "$2" "no scratch database: ${scratch_why:-cause unrecorded}"
    return 1
  fi
  return 0
}

require_daemon() {
  if [ "$daemon_ok" != 1 ]; then
    record FAIL "$1" "$2" "the daemon is not running, see check 2"
    return 1
  fi
  return 0
}

require_seed() {
  if [ "$seed_ok" != 1 ]; then
    record FAIL "$1" "$2" "the repos were never seeded over SSH, see check 2"
    return 1
  fi
  return 0
}

# macOS ships no timeout(1), so bound the wait and kill the straggler
bounded() {
  local limit=$1
  shift
  "$@" &
  local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$limit" ]; do
    sleep 0.5
    waited=$((waited + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
    return 124
  fi
  wait "$pid"
}

# git appends its own -p from the URL, so this carries flags only
as_user() {
  local key=$1
  shift
  export GIT_SSH_COMMAND="ssh $SSH_FLAGS -i $key"
  bounded 60 "$@"
  local status=$?
  unset GIT_SSH_COMMAND
  return $status
}

ssh_url() {
  printf 'ssh://git@127.0.0.1:%s/%s' "$ssh_port" "$1"
}

page_url() {
  printf 'http://127.0.0.1:%s%s' "$http_port" "$1"
}

free_port() {
  node -e 'const s = require("net").createServer()
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address()
      s.close(() => { console.log(port) })
    })'
}

# a page fetch that keeps the path exactly as written, so an encoded
# payload reaches the router as one segment
fetch_page() {
  curl -sS --path-as-is --max-time 30 -D "$2.head" -o "$2.body" -w '%{http_code}' \
    "$(page_url "$1")" 2>"$2.err"
}

# the template joins mapped rows with no separator, so several land on one
# line and grep -c would answer 1 however many there are
occurrences() {
  grep -oF "$2" "$1" 2>/dev/null | grep -c .
}

start_daemon() {
  ssh_port=$(free_port)
  http_port=$(free_port)
  [ -n "$ssh_port" ] && [ -n "$http_port" ] || return 1
  # only the daemon sees the counting shim; the script's own git is real
  PATH="$shim:$PATH" DATABASE_URL="$scratch_url" CARN_REPO_ROOT="$repo_root" \
    CARN_SSH_HOST_KEY="$host_key" CARN_SSH_HOST=127.0.0.1 \
    CARN_SSH_PORT="$ssh_port" HOST=127.0.0.1 PORT="$http_port" \
    node dist/src/index.js > "$work/daemon.log" 2>&1 &
  daemon_pid=$!
  local waited=0
  while [ "$waited" -lt 80 ]; do
    kill -0 "$daemon_pid" 2>/dev/null || return 1
    # ssh2.Server has no .listening at runtime, so poll the ports themselves
    if nc -z 127.0.0.1 "$ssh_port" 2>/dev/null && nc -z 127.0.0.1 "$http_port" 2>/dev/null; then
      return 0
    fi
    sleep 0.25
    waited=$((waited + 1))
  done
  return 1
}

# a filtered run exits 0 when its pattern matches nothing, so only an exact
# count separates "every named test passed" from "no such test any more".
# no title carries a metacharacter but ".", so anchoring beats escaping
runner_ok=""

check_runner() {
  [ -z "$runner_ok" ] || return "$runner_ok"
  # .mjs: $work sits outside the repo, so a .js there loads as CommonJS
  local probe="$work/runner.control.mjs"
  printf '%s\n' \
    'import test from "node:test";' \
    'test("carn runner control passes", () => {});' \
    'test("carn runner control fails", () => { throw new Error("planted"); });' \
    > "$probe"
  local out="$work/runner.tap"
  node --test --test-reporter=tap "$probe" > "$out" 2>&1
  local passed failed
  passed=$(sed -nE 's/^# pass ([0-9]+)$/\1/p' "$out" | tail -1)
  failed=$(sed -nE 's/^# fail ([0-9]+)$/\1/p' "$out" | tail -1)
  if [ "${passed:-}" = "1" ] && [ "${failed:-}" = "1" ]; then
    runner_ok=0
  else
    runner_ok=1
  fi
  return "$runner_ok"
}

# contract <number> <title> <expected> <lead> <file…> [-- <test title…>]
contract() {
  local number=$1 title=$2 expected=$3 lead=$4
  shift 4
  local files=() args=() titles=() item patterns=0
  for item in "$@"; do
    if [ "$item" = "--" ]; then
      patterns=1
      continue
    fi
    if [ "$patterns" = 0 ]; then
      files+=("dist/test/contract/$item.contract.js")
    else
      args+=(--test-name-pattern "^$item\$")
      titles+=("$item")
    fi
  done

  if ! check_runner; then
    record FAIL "$number" "$title" "the test runner control did not report one pass and one failure; it cannot gate"
    return 1
  fi

  # a name-pattern matching nothing still reports the file itself as one
  # passing subtest, so a renamed or deleted test would pass silently
  local missing=()
  for item in "${titles[@]+"${titles[@]}"}"; do
    grep -qF "$item" "${files[@]}" || missing+=("$item")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    record FAIL "$number" "$title" "named test no longer exists: ${missing[*]}"
    return 1
  fi

  local out="$work/$number.tap"
  node --test --test-reporter=tap ${args[@]+"${args[@]}"} "${files[@]}" > "$out" 2>&1
  local status=$? passed failed
  passed=$(sed -nE 's/^# pass ([0-9]+)$/\1/p' "$out" | tail -1)
  failed=$(sed -nE 's/^# fail ([0-9]+)$/\1/p' "$out" | tail -1)

  if [ "${failed:-1}" != "0" ] || [ "$status" -ne 0 ]; then
    record FAIL "$number" "$title" "${failed:-unknown} failing of ${passed:-0} passing, exit $status
$(grep -E '^not ok ' "$out" | head -5)"
    return 1
  fi
  if [ "${passed:-0}" != "$expected" ]; then
    record FAIL "$number" "$title" "${passed:-0} test(s) ran, expected exactly $expected. A renamed or deleted test leaves this check gating nothing; a deliberately added one wants the count here raised."
    return 1
  fi
  record PASS "$number" "$title" "${lead:+$lead, }$passed contract test(s)"
  return 0
}

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

scratch_db=""
scratch_url=""
scratch_ok=0
scratch_why=""
build_ok=0
daemon_ok=0
seed_ok=0

scratch_dsn() {
  # swap the database name, leaving any query string intact
  printf '%s' "$1" | sed -E "s#(://[^/]*)/[^/?]*#\1/$2#"
}

setup_scratch() {
  [ -n "${DATABASE_URL:-}" ] || return 1
  scratch_db="carn_verify_$$"
  psql "$DATABASE_URL" --no-psqlrc -q \
    -c "DROP DATABASE IF EXISTS \"$scratch_db\" WITH (FORCE)" 2>/dev/null
  psql "$DATABASE_URL" --no-psqlrc -q \
    -c "CREATE DATABASE \"$scratch_db\"" 2>"$work/scratch.err" || return 1
  scratch_url=$(scratch_dsn "$DATABASE_URL" "$scratch_db")
  DATABASE_URL="$scratch_url" npx prisma migrate deploy \
    > "$work/scratch.migrate" 2>&1 || return 1
  return 0
}

drop_scratch() {
  [ -n "${scratch_db:-}" ] || return 0
  psql "$DATABASE_URL" --no-psqlrc -q \
    -c "DROP DATABASE IF EXISTS \"$scratch_db\" WITH (FORCE)" 2>/dev/null
  scratch_db=""
}

write_readme() {
  cat > "$1" <<'README'
# Verify 1d

<script>alert(1)</script>

[external](https://example.com/x)
[relative](docs/BRAND.md)
[root-relative](/r/verify1d)
[anchor](#notes)
[mail](mailto:hi@example.com)
[payload](javascript:alert(1))

<https://example.com/auto>

[ref][site]

![remote](https://example.com/pic.png)

<img src=x onerror=alert(1)>

## Notes

| Ref | Kind |
| --- | --- |
| main | branch |

[site]: https://example.com/ref
README
}

# a git that records every call the daemon makes, then becomes the real one
write_shim() {
  local real
  real=$(command -v git) || return 1
  mkdir -p "$shim" || return 1
  printf '#!/bin/sh\necho call >> %s\nexec %s "$@"\n' "$spawn_log" "$real" \
    > "$shim/git" || return 1
  chmod +x "$shim/git" || return 1
  : > "$spawn_log"
  [ -x "$shim/git" ] || return 1
  return 0
}

echo "Phase 1d exit checks"
echo

# taken before any work, so check 22 can prove the run added nothing
dev_rows=""
if [ -n "${DATABASE_URL:-}" ]; then
  dev_rows=$(psql_dev -c "select (select count(*) from repos) || ':' || (select count(*) from ssh_keys)" 2>/dev/null)
fi
dev_root_entries=$(find "$DEFAULT_ROOT" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')

# 1
strict=$(sed -nE 's/.*"strict"[[:space:]]*:[[:space:]]*(true|false).*/\1/p' tsconfig.json)
if [ "$strict" != "true" ]; then
  record FAIL 1 "npm ci and npm run build are clean under strict" "tsconfig.json strict is '${strict:-unset}', not true"
elif ! npm ci > "$work/1" 2>&1; then
  record FAIL 1 "npm ci and npm run build are clean under strict" "$(tail -5 "$work/1")"
elif npm run build >> "$work/1" 2>&1 && [ -f dist/src/index.js ]; then
  build_ok=1
  record PASS 1 "npm ci and npm run build are clean under strict"
else
  record FAIL 1 "npm ci and npm run build are clean under strict" "$(tail -10 "$work/1")"
fi

if setup_scratch; then
  scratch_ok=1
else
  scratch_why=$(tail -3 "$work/scratch.err" "$work/scratch.migrate" 2>/dev/null | tail -4)
fi

admin_key="$work/admin_key"
ssh-keygen -t ed25519 -N '' -C "admin@carn.invalid" -f "$admin_key" -q < /dev/null > /dev/null 2>&1

mkdir -p "$seed/$REPO_NAME/docs" "$seed/$REPO_NAME/src" "$seed/$BARE_NAME" "$repo_root"
write_readme "$seed/$REPO_NAME/README.md"
printf '# Brand\n\nOne accent, no motion.\n' > "$seed/$REPO_NAME/docs/BRAND.md"
printf 'export {};\n' > "$seed/$REPO_NAME/src/index.ts"
printf '{ "name": "verify1d" }\n' > "$seed/$REPO_NAME/package.json"
printf '#!/bin/sh\necho bare\n' > "$seed/$BARE_NAME/run.sh"

for name in "$REPO_NAME" "$BARE_NAME"; do
  git -C "$seed/$name" init -q -b main > /dev/null 2>&1
  git -C "$seed/$name" add -A > /dev/null 2>&1
  git -C "$seed/$name" commit -q -m "Seed $name" > /dev/null 2>&1
done

# 2
readonly TITLE_2="the index answers 200 and lists every repo in the database"
if require_db 2 "$TITLE_2" && require_build 2 "$TITLE_2" && require_scratch 2 "$TITLE_2"; then
  if ! write_shim; then
    record FAIL 2 "$TITLE_2" "no executable git shim could be written, so check 13 could not count"
  else
    DATABASE_URL="$scratch_url" npm run key:add -- "$admin_key.pub" carn-verify \
      > "$work/2.key" 2>&1
    key_status=$?
    if [ "$key_status" -ne 0 ]; then
      record FAIL 2 "$TITLE_2" "key:add failed: $(tail -3 "$work/2.key")"
    elif ! start_daemon; then
      record FAIL 2 "$TITLE_2" "the daemon did not start: $(tail -5 "$work/daemon.log" 2>/dev/null)"
    else
      daemon_ok=1
      pushed=0
      for name in "$REPO_NAME" "$BARE_NAME"; do
        as_user "$admin_key" git -C "$seed/$name" push "$(ssh_url "$name")" main:refs/heads/main \
          >> "$work/2.push" 2>&1 && pushed=$((pushed + 1))
      done
      if [ "$pushed" -ne 2 ]; then
        record FAIL 2 "$TITLE_2" "only $pushed of 2 seed pushes landed: $(tail -5 "$work/2.push")"
      else
        seed_ok=1
        status=$(fetch_page "/" "$work/2")
        rows=$(psql_scratch -c "select count(*) from repos")
        listed=$(occurrences "$work/2.body" '<li class="row">')
        missing=""
        for name in "$REPO_NAME" "$BARE_NAME"; do
          grep -qF "href=\"/r/$name\"" "$work/2.body" || missing="$missing $name"
        done
        if [ "$status" != "200" ]; then
          record FAIL 2 "$TITLE_2" "the index answered ${status:-nothing}: $(tail -3 "$work/2.err")"
        elif [ -n "$missing" ]; then
          record FAIL 2 "$TITLE_2" "the index links no row for:$missing"
        elif [ "$listed" != "$rows" ]; then
          record FAIL 2 "$TITLE_2" "$rows repo(s) in the database, $listed row(s) on the page"
        else
          record PASS 2 "$TITLE_2" "200 with $listed row(s), one per database row"
        fi
      fi
    fi
  fi
fi

# 3
readonly TITLE_3="a repo page answers 200 with its tree and its rendered readme"
if require_daemon 3 "$TITLE_3" && require_seed 3 "$TITLE_3"; then
  status=$(fetch_page "/r/$REPO_NAME" "$work/3")
  tree_rows=$(occurrences "$work/3.body" '<li class="row')
  wrong=""
  for entry in 'README.<span class="sc">md</span>' \
    '<span class="sc">package</span>.<span class="sc">json</span>' \
    '<span class="sc">docs</span>/' '<span class="sc">src</span>/'; do
    grep -qF "$entry" "$work/3.body" || wrong="$wrong missing tree entry '$entry';"
  done
  for rendered in '<div class="readme">' '<h1>Verify 1d</h1>' '<h2>Notes</h2>' '<table>'; do
    grep -qF "$rendered" "$work/3.body" || wrong="$wrong readme lacks '$rendered';"
  done
  if [ "$status" != "200" ]; then
    record FAIL 3 "$TITLE_3" "the page answered ${status:-nothing}: $(tail -3 "$work/3.err")"
  elif [ "$tree_rows" != "4" ]; then
    record FAIL 3 "$TITLE_3" "the tree drew $tree_rows row(s), wanted 4"
  elif [ -n "$wrong" ]; then
    record FAIL 3 "$TITLE_3" "$wrong"
  else
    record PASS 3 "$TITLE_3" "200, 4 tree rows, and the readme rendered to headings and a table"
  fi
fi

# 4
readonly TITLE_4="a repo with no readme draws the tree and says how to make one"
if require_daemon 4 "$TITLE_4" && require_seed 4 "$TITLE_4"; then
  status=$(fetch_page "/r/$BARE_NAME" "$work/4")
  tree_rows=$(occurrences "$work/4.body" '<li class="row')
  if [ "$status" != "200" ]; then
    record FAIL 4 "$TITLE_4" "the page answered ${status:-nothing}: $(tail -3 "$work/4.err")"
  elif [ "$tree_rows" != "1" ]; then
    record FAIL 4 "$TITLE_4" "the tree drew $tree_rows row(s), wanted 1"
  elif grep -qF '<div class="readme">' "$work/4.body"; then
    record FAIL 4 "$TITLE_4" "the page rendered a readme it does not have"
  elif ! grep -qF "$NO_README" "$work/4.body"; then
    record FAIL 4 "$TITLE_4" "wanted \"$NO_README\", got: $(grep -oF -m1 '<div class="empty">' "$work/4.body")"
  elif ! grep -qF 'git add README.md' "$work/4.body"; then
    record FAIL 4 "$TITLE_4" "the empty state says what would be here but not how to make one"
  else
    record PASS 4 "$TITLE_4" "200, 1 tree row, and the empty state carries the command"
  fi
fi

# 5
# the live half proves the answer; the contract half proves the invalid
# branch returns before any query, which no response body can show
readonly TITLE_5="an unknown repo is 404 and an invalid name is refused before the query"
if require_daemon 5 "$TITLE_5" && require_seed 5 "$TITLE_5"; then
  absent_status=$(fetch_page "/r/$ABSENT_NAME" "$work/5a")
  bad=""
  long_name=$(printf 'a%.0s' $(seq 65))
  for name in '-x' '.hidden' '%2e%2e%2fetc' "$long_name"; do
    status=$(fetch_page "/r/$name" "$work/5b")
    if [ "$status" != "404" ]; then
      bad="$bad '$name' answered ${status:-nothing};"
    elif ! grep -qF "$BAD_NAME" "$work/5b.body"; then
      bad="$bad '$name' drew no bad-name page;"
    fi
  done
  if [ "$absent_status" != "404" ]; then
    record FAIL 5 "$TITLE_5" "the absent repo answered ${absent_status:-nothing}: $(tail -3 "$work/5a.err")"
  elif ! grep -qF "$NO_REPO" "$work/5a.body"; then
    record FAIL 5 "$TITLE_5" "wanted \"$NO_REPO\", got: $(head -c 200 "$work/5a.body")"
  elif [ -n "$bad" ]; then
    record FAIL 5 "$TITLE_5" "$bad"
  else
    contract 5 "$TITLE_5" 1 "404 and the right copy for the absent name and four invalid ones" \
      repo-page -- \
      "an invalid repo name is refused before any database query"
  fi
fi

# 6
contract 6 "no interpolation lands in an unquoted attribute position" 3 "" \
  unquoted-attribute -- \
  "no interpolation lands in an unquoted attribute position" \
  "the planted fixture is caught" \
  "source the scanner cannot parse fails loudly"

# 7
# two doors: the check constraint keeps such a name out of the table, and
# the router refuses it without echoing what it was handed
readonly TITLE_7="a repo named with an escape sequence never reaches a body"
if require_daemon 7 "$TITLE_7" && require_scratch 7 "$TITLE_7"; then
  echoed=""
  for name in '%3Cscript%3Ealert(1)%3C%2Fscript%3E' '%22%3E%3Cimg%20onerror%3Dalert(1)%3E' '%0Aalert(1)'; do
    status=$(fetch_page "/r/$name" "$work/7")
    if [ "$status" != "404" ]; then
      echoed="$echoed '$name' answered ${status:-nothing};"
      continue
    fi
    for trace in '<script' '&lt;script' 'onerror' 'alert(1)'; do
      grep -qF "$trace" "$work/7.body" && echoed="$echoed '$name' put '$trace' in the body;"
    done
  done
  stored=$(psql_scratch -c \
    "insert into repos (id, owner_id, name, created_at) select gen_random_uuid(), id, '<script>', now() from users limit 1" \
    2>&1)
  if [ -n "$echoed" ]; then
    record FAIL 7 "$TITLE_7" "$echoed"
  elif ! printf '%s' "$stored" | grep -q 'repos_name_format'; then
    record FAIL 7 "$TITLE_7" "the table took a name of '<script>': ${stored:-no error}"
  else
    contract 7 "$TITLE_7" 2 "three encoded payloads left no trace, and the name constraint held" \
      index-page wordmark -- \
      "a description is escaped, never interpolated raw" \
      "a repo name is escaped into the mark"
  fi
fi

# 8
readonly TITLE_8="a hostile readme renders inert and a remote image survives for the csp"
if require_daemon 8 "$TITLE_8" && require_seed 8 "$TITLE_8"; then
  served_csp=$(grep -i '^content-security-policy:' "$work/3.head" \
    | sed 's/^[^:]*: *//' | tr -d '\r')
  wrong=""
  for inert in '&lt;script&gt;alert(1)&lt;/script&gt;' \
    '[payload](javascript:alert(1))' \
    '&lt;img src=x onerror=alert(1)&gt;'; do
    grep -qF "$inert" "$work/3.body" || wrong="$wrong '$inert' is not in the body as inert text;"
  done
  # each probe is a shape only a live payload makes: "onerror=" alone is a
  # substring of the escaped text this page is supposed to be showing
  for live in '<script>' 'href="javascript:' '<img src=x onerror'; do
    grep -qF "$live" "$work/3.body" && wrong="$wrong '$live' reached the body live;"
  done
  grep -qF '<img src="https://example.com/pic.png" alt="remote" />' "$work/3.body" \
    || wrong="$wrong the remote image did not survive with its alt;"
  if [ -n "$wrong" ]; then
    record FAIL 8 "$TITLE_8" "$wrong"
  elif [ "$served_csp" != "$CSP" ]; then
    record FAIL 8 "$TITLE_8" "the repo page's CSP is '${served_csp:-absent}', not the app's own"
  else
    contract 8 "$TITLE_8" 4 "the served payloads are inert and the CSP is the app's own" \
      markdown repo-page -- \
      "a readme carrying three payloads renders inert" \
      "a remote image survives the markdown layer for CSP to stop" \
      "a hostile readme renders inert through the page" \
      "a remote readme image survives for the csp to stop"
  fi
fi

# 9
contract 9 "validateLink rejects javascript:, and the allowlist is what does it" 4 "" \
  markdown -- \
  "the allowlist denies a scheme markdown-it's own default allows" \
  "a javascript: payload alone cannot prove the allowlist" \
  "every denied destination renders no link at all" \
  "an entity-encoded scheme is decoded before the allowlist sees it"

# 10
# the whole file: both render paths, the enumeration that keeps the list
# honest, and the deleted-token control
contract 10 "every BRAND.md token resolves non-empty on :root in both paths" 5 "" \
  token-resolution

# 11
# served over real http, not set into about:blank, so the audit measures
# Carn Sans and Carn Mono rather than whatever the host falls back to
contract 11 "zero axe violations across both render paths, gallery included" 31 "" \
  axe

# 12
readonly TITLE_12="every page fits the 100 KB budget, fonts and stylesheet in"
if require_daemon 12 "$TITLE_12" && require_seed 12 "$TITLE_12"; then
  over=""
  index_bytes=$(wc -c < "$work/2.body" | tr -d ' ')
  show_bytes=$(wc -c < "$work/3.body" | tr -d ' ')
  [ "$index_bytes" -lt "$PAGE_BUDGET" ] || over="$over the index document is $index_bytes B;"
  [ "$show_bytes" -lt "$PAGE_BUDGET" ] || over="$over the repo document is $show_bytes B;"
  if [ -n "$over" ]; then
    record FAIL 12 "$TITLE_12" "$over"
  else
    contract 12 "$TITLE_12" 2 "index $index_bytes B, repo page $show_bytes B" \
      assets repo-page -- \
      "the whole page fits the budget with both families and the sheet" \
      "the repo page fits the weight budget, fonts and stylesheet in"
  fi
fi

# 13
# the shim counts what the daemon's own render spawns. a count of zero
# means it never sat on the child's PATH, so nothing was measured
readonly TITLE_13="a repo page render stays under 12 spawn calls"
if require_daemon 13 "$TITLE_13" && require_seed 13 "$TITLE_13"; then
  : > "$spawn_log"
  status=$(fetch_page "/r/$REPO_NAME?all=1" "$work/13")
  spawns=$(grep -c . "$spawn_log")
  if [ "$status" != "200" ]; then
    record FAIL 13 "$TITLE_13" "the page answered ${status:-nothing}, so nothing was rendered to count"
  elif [ "$spawns" -eq 0 ]; then
    record FAIL 13 "$TITLE_13" "the shim recorded no call, so it never reached the daemon's PATH"
  elif [ "$spawns" -ge "$SPAWN_BUDGET" ]; then
    record FAIL 13 "$TITLE_13" "$spawns spawn(s) against a budget of $SPAWN_BUDGET"
  else
    contract 13 "$TITLE_13" 1 "$spawns spawn(s) counted over HTTP" \
      repo-page -- \
      "a repo page render stays inside the spawn budget"
  fi
fi

# 14
readonly TITLE_14="neither page carries a script tag"
if require_daemon 14 "$TITLE_14" && require_seed 14 "$TITLE_14"; then
  scripted=""
  for page in 2 3; do
    tags=$(occurrences "$work/$page.body" '<script')
    [ "$tags" = "0" ] || scripted="$scripted $tags in $work/$page.body;"
  done
  if [ -n "$scripted" ]; then
    record FAIL 14 "$TITLE_14" "$scripted"
  else
    contract 14 "$TITLE_14" 2 "no script tag in either served body" \
      index-page repo-page -- \
      "no page carries script, an inline style, or a style attribute" \
      "no repo page carries script, an inline style, or a style attribute"
  fi
fi

# 15
readonly TITLE_15="small caps keep the true lowercase and filenames carry lang"
if require_daemon 15 "$TITLE_15" && require_seed 15 "$TITLE_15"; then
  wrong=""
  grep -qF '<span class="nm t-item" lang="en">README.<span class="sc">md</span></span>' "$work/3.body" \
    || wrong="$wrong the README row is not the lang-stamped small-caps shape;"
  grep -qF '<span class="nm t-item" lang="en"><span class="sc">docs</span>/</span>' "$work/3.body" \
    || wrong="$wrong the docs row is not the lang-stamped small-caps shape;"
  if [ -n "$wrong" ]; then
    record FAIL 15 "$TITLE_15" "$wrong"
  else
    contract 15 "$TITLE_15" 4 "both served rows keep the lowercase and the lang" \
      repo-page gallery -- \
      "the rendered dom holds the true filename under small caps" \
      "a directory row carries the accent class and a trailing slash" \
      "small caps split lowercase runs and never insert whitespace" \
      "a directory's trailing slash is real text, and small caps are unspaced"
  fi
fi

# 23
# out of order on purpose: it reads the same served body checks 3 and 8 do,
# and the daemon comes down below. it prints in its own place further on
rel_verdict=""
rel_detail=""
if [ "$seed_ok" = 1 ]; then
  rels=$(occurrences "$work/3.body" "$REL")
  bare=""
  for local_link in '<a href="docs/BRAND.md">relative</a>' \
    '<a href="/r/verify1d">root-relative</a>' \
    '<a href="#notes">anchor</a>' \
    '<a href="mailto:hi@example.com">mail</a>'; do
    grep -qF "$local_link" "$work/3.body" || bare="$bare $local_link;"
  done
  if [ "$rels" != "3" ]; then
    rel_verdict=FAIL
    rel_detail="$rels link(s) carry $REL, wanted 3: the inline, the autolink, and the reference"
  elif [ -n "$bare" ]; then
    rel_verdict=FAIL
    rel_detail="a local link is missing or picked up a rel:$bare"
  fi
fi

stop_daemon

# torn down here, not at check 22: verify-phase-1b.sh's own check 23 counts
# every carn_verify_% database, and would read this run's as a stray
drop_scratch
rm -rf "$repo_root"

# 16
# two runs, one per color scheme: tuffgal pins colorScheme per run, so a
# single run would leave one palette unphotographed
readonly TITLE_16="the tuffgal story passes for both pages in both palettes"
if require_db 16 "$TITLE_16"; then
  npm run visual > "$work/16" 2>&1
  visual_status=$?
  passes=$(grep -c '^== \(dark\|light\) ==$' "$work/16")
  # one summary line per run, whatever verdict each reached
  summaries=$(sed -n 's/^[^0-9]*\([0-9][0-9]* [a-z]* on "desktop" breakpoint\)$/\1/p' "$work/16")
  if [ "$visual_status" -ne 0 ]; then
    record FAIL 16 "$TITLE_16" "npm run visual exited $visual_status: $(grep -m1 'tuffgal error' "$work/16" || tail -3 "$work/16")"
  elif [ "$passes" != "2" ] || [ "$(printf '%s\n' "$summaries" | grep -c .)" != "2" ]; then
    record FAIL 16 "$TITLE_16" "$passes of 2 color-scheme runs started and $(printf '%s\n' "$summaries" | grep -c .) of 2 reported, so a palette went unphotographed"
  else
    record PASS 16 "$TITLE_16" "$(printf '%s' "$summaries" | tr '\n' ';' | sed 's/;/; /g')"
  fi
fi

# 17
# spelled as a pattern so this script is not itself a hit
spawn_shell='shell:[[:space:]]*true'
printf 'spawn(cmd, { %s: %s })\n' shell true > "$work/17.control"
if ! grep -qE "$spawn_shell" "$work/17.control"; then
  record FAIL 17 "no shell-enabled spawn in source" "the pattern does not match a known violation; it cannot gate"
else
  # source only: docs quote the rule, --untracked sees uncommitted files
  hits=$(git grep --untracked -nE "$spawn_shell" -- src test scripts prisma prisma.config.ts)
  if [ -z "$hits" ]; then
    record PASS 17 "no shell-enabled spawn in source"
  else
    record FAIL 17 "no shell-enabled spawn in source" "$hits"
  fi
fi

# 18
# a git pathspec * crosses /, so src/**/*.ts would skip src/config.ts
readonly TITLE_18="every .ts under src, test and scripts opens with the SPDX line"
spdx_line='// SPDX-License-Identifier: AGPL-3.0-or-later'
# positive control: prove the comparison below can tell a header from none
printf '%s\n' "$spdx_line" > "$work/18.good"
printf 'no header\n' > "$work/18.bad"
if [ "$(head -1 "$work/18.good")" != "$spdx_line" ] || [ "$(head -1 "$work/18.bad")" = "$spdx_line" ]; then
  record FAIL 18 "$TITLE_18" "the header comparison does not discriminate; it cannot gate"
else
  sources=$(git ls-files --cached --others --exclude-standard -- src test scripts \
    | grep '\.ts$' | grep -v '^src/generated/')
  source_count=$(printf '%s\n' "$sources" | grep -c . )
  found_count=$(find src test scripts -name '*.ts' -not -path 'src/generated/*' 2>/dev/null | wc -l | tr -d ' ')
  unstamped=""
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    [ "$(head -1 "$file")" = "$spdx_line" ] || unstamped="$unstamped $file"
  done <<< "$sources"
  if [ "$source_count" -eq 0 ]; then
    record FAIL 18 "$TITLE_18" "no source files enumerated"
  elif [ "$source_count" != "$found_count" ]; then
    record FAIL 18 "$TITLE_18" "git listed $source_count files, find listed $found_count"
  elif [ -n "$unstamped" ]; then
    record FAIL 18 "$TITLE_18" "missing on:$unstamped"
  else
    record PASS 18 "$TITLE_18" "$source_count files checked"
  fi
fi

# 19
readonly TITLE_19="dependencies are 1c's plus 1d's four, and no more"
if node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"))
  const budget = {
    dependencies: ["fastify", "@prisma/client", "@prisma/adapter-pg", "ssh2", "markdown-it"],
    devDependencies: ["prisma", "typescript", "@types/node", "squawk-cli", "@biomejs/biome", "@types/ssh2", "axe-core", "playwright", "tuffgal"],
  }
  const over = []
  for (const [field, allowed] of Object.entries(budget)) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (!allowed.includes(name)) over.push(`${name} (${field})`)
    }
  }
  if (over.length) { console.error("1d adds four, but found: " + over.join(", ")); process.exit(1) }
  const placed = { "markdown-it": "dependencies", tuffgal: "devDependencies", "axe-core": "devDependencies", playwright: "devDependencies" }
  for (const [name, field] of Object.entries(placed)) {
    if (!pkg[field]?.[name]) { console.error(`${name} is not in ${field}`); process.exit(1) }
  }
  for (const name of ["@types/markdown-it", "@axe-core/playwright"]) {
    if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) { console.error(`${name} is installed`); process.exit(1) }
  }
' > "$work/19" 2>&1; then
  record PASS 19 "$TITLE_19"
else
  record FAIL 19 "$TITLE_19" "$(cat "$work/19")"
fi

# 20
# a zero-match glob exits 0, so the file list is built before linting
readonly TITLE_20="squawk finds no issues in the migrations"
sql=()
while IFS= read -r file; do
  sql+=("$file")
done < <(find prisma/migrations -name '*.sql' 2>/dev/null | sort)
if [ "${#sql[@]}" -eq 0 ]; then
  record FAIL 20 "$TITLE_20" "no migration SQL found to lint"
elif npx squawk "${sql[@]}" > "$work/20" 2>&1; then
  record PASS 20 "$TITLE_20" "${#sql[@]} file(s) linted"
else
  record FAIL 20 "$TITLE_20" "$(tail -10 "$work/20")"
fi

# 21
# after the daemon is down and the scratch database is dropped: 1a's check
# 9 needs port 3000, and 1b's check 23 reads a live scratch as a stray
readonly TITLE_21="the 1a, 1b and 1c verify scripts all still pass in full"
if require_db 21 "$TITLE_21"; then
  failed=""
  for phase in 1a 1b 1c; do
    "./scripts/verify-phase-$phase.sh" > "$work/21.$phase" 2>&1 \
      || failed="$failed $phase: $(grep '^FAIL' "$work/21.$phase" | head -3 | tr '\n' ' ')"
  done
  if [ -n "$failed" ]; then
    record FAIL 21 "$TITLE_21" "$failed"
  else
    record PASS 21 "$TITLE_21" "$(tail -1 "$work/21.1a"), $(tail -1 "$work/21.1b"), $(tail -1 "$work/21.1c")"
  fi
fi

# 22
# the run is idempotent by construction: a scratch database named for this
# pid, a mktemp repo root, ephemeral ports, and one trap. what a second run
# would inherit is exactly what this check refuses to find
readonly TITLE_22="the run leaves no scratch database, rows, or repos behind"
if require_db 22 "$TITLE_22"; then
  strays=$(psql_dev -c "select count(*) from pg_database where datname like 'carn_verify_%'")
  dev_now=$(psql_dev -c "select (select count(*) from repos) || ':' || (select count(*) from ssh_keys)" 2>/dev/null)
  root_now=$(find "$DEFAULT_ROOT" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
  left=""
  # an unreadable snapshot would compare equal to an unreadable count
  printf '%s' "$dev_rows" | grep -qE '^[0-9]+:[0-9]+$' \
    || left="$left the opening row count read '${dev_rows:-nothing}';"
  [ "$strays" = "0" ] || left="$left $strays carn_verify_% database(s);"
  [ "$dev_now" = "$dev_rows" ] || left="$left repos:ssh_keys went $dev_rows to $dev_now;"
  [ "$root_now" = "$dev_root_entries" ] || left="$left $DEFAULT_ROOT went $dev_root_entries to $root_now entries;"
  [ -d "$repo_root" ] && left="$left the temporary repo root survives;"
  if [ -z "$left" ]; then
    record PASS 22 "$TITLE_22" "development database still $dev_rows repos:ssh_keys"
  else
    record FAIL 22 "$TITLE_22" "$left"
  fi
fi

# 23
readonly TITLE_23="external readme links carry the rel and nothing else does"
if [ "$seed_ok" != 1 ]; then
  record FAIL 23 "$TITLE_23" "the repos were never seeded over SSH, see check 2"
elif [ "$rel_verdict" = FAIL ]; then
  record FAIL 23 "$TITLE_23" "$rel_detail"
else
  contract 23 "$TITLE_23" 4 "3 served external links carry it and 4 local ones do not" \
    markdown repo-page -- \
    "an external link carries the rel, in all three link forms" \
    "a link that is not external carries no rel at all" \
    "the rel rule renders through a fallback, keeping other attributes" \
    "external readme links carry the rel and local ones do not"
fi

ran=$(grep -c . "$log")
fails=$(grep -c '^FAIL ' "$log")

echo
if [ "$fails" -eq 0 ] && [ "$ran" -eq "$EXPECTED_CHECKS" ]; then
  echo "Phase 1d: $ran of $EXPECTED_CHECKS checks passed."
  exit 0
fi
echo "Phase 1d: $fails failing, $ran of $EXPECTED_CHECKS checks ran."
exit 1

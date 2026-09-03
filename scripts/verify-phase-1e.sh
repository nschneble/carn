#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Phase 1e exit checks, from docs/phases/1e-views.md, 1e-revision.md, and
# 1e-revision-2.md. Prints PASS or FAIL for each of the 51 checks and exits
# non-zero if any fail. Reads
# DATABASE_URL from the environment, falling back to ./.env. Check 24 runs
# 1a, 1b, 1c and 1d, and each of those runs the ones before it, so a full
# run takes tens of minutes.

# not set -e: this runs commands expected to fail and reads their status
set -uo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

readonly EXPECTED_CHECKS=56
readonly REPO_NAME=verify1e
readonly ABSENT_NAME=absent1e
readonly DEFAULT_ROOT=./local/repos
readonly PAGE_BUDGET=102400
readonly SPAWN_BUDGET=12
readonly NAME_CAP=40
readonly ROW_CAP=16
readonly NESTED_ROWS=20
readonly TTFB_LIMIT_MS=100
readonly RAW_ORIGIN="https://gelatinous-cube.example"
readonly SSH_FLAGS="-o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=5"
readonly DEEP_PATH=apps/web/src/deep.ts
readonly NESTED_DIR=apps/web/src
readonly SEED_AT=2026-01-05T09:00:00Z

# as served: error-page.ts writes apostrophes and the html tag escapes them
readonly NO_REPO="There&#39;s no repo named $ABSENT_NAME on this server."
readonly BAD_NAME="That URL doesn&#39;t carry a repo name this server can look up."
readonly BAD_NAME_NEXT="dots, dashes, and underscores, up to $NAME_CAP characters."

work=$(mktemp -d) || work=""
if [ -z "$work" ]; then
  echo "verify-phase-1e: gave no temp directory" >&2
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
raw_pid=""
raw_port=""
launch_pid=""
launch_http=""
launch_ssh=""

stop_one() {
  local pid=$1
  [ -n "$pid" ] || return 0
  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
  return 0
}

stop_daemons() {
  stop_one "$raw_pid"
  raw_pid=""
  stop_one "$daemon_pid"
  daemon_pid=""
}

cleanup() {
  stop_daemons
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
    record FAIL "$1" "$2" "the repo was never seeded over SSH, see check 2"
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
  bounded 120 "$@"
  local status=$?
  unset GIT_SSH_COMMAND
  return $status
}

# every seed commit is dated, so the log, the tree's age column and both
# ref tables render the same ages on every machine the script runs on
seed_git() {
  local at=$1 dir=$2
  shift 2
  GIT_AUTHOR_DATE="$at" GIT_COMMITTER_DATE="$at" \
    GIT_AUTHOR_NAME="Carn Verify" GIT_AUTHOR_EMAIL="verify@carn.invalid" \
    GIT_COMMITTER_NAME="Carn Verify" GIT_COMMITTER_EMAIL="verify@carn.invalid" \
    git -C "$dir" "$@"
}

ssh_url() {
  printf 'ssh://git@127.0.0.1:%s/%s' "$ssh_port" "$1"
}

page_url() {
  printf 'http://127.0.0.1:%s%s' "$http_port" "$1"
}

raw_url() {
  printf 'http://127.0.0.1:%s%s' "$raw_port" "$1"
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
fetch_url() {
  curl -sS --path-as-is --max-time 60 -D "$2.head" -o "$2.body" -w '%{http_code}' \
    "$1" 2>"$2.err"
}

fetch_page() {
  fetch_url "$(page_url "$1")" "$2"
}

# the template joins mapped rows with no separator, so several land on one
# line and grep -c would answer 1 however many there are
occurrences() {
  grep -oF "$2" "$1" 2>/dev/null | grep -c .
}

matches() {
  grep -oE "$2" "$1" 2>/dev/null | grep -c .
}

# every spawn the daemon makes, with its argv, so a check can count one
# `for-each-ref` or one `log --name-status` and not merely twelve calls
write_shim() {
  local real
  real=$(command -v git) || return 1
  mkdir -p "$shim" || return 1
  {
    printf '#!/bin/sh\n'
    printf 'printf "%%s\\n" "$*" >> %s\n' "$spawn_log"
    printf 'exec %s "$@"\n' "$real"
  } > "$shim/git" || return 1
  chmod +x "$shim/git" || return 1
  : > "$spawn_log"
  [ -x "$shim/git" ] || return 1
  return 0
}

spawns_of() {
  grep -c . "$spawn_log"
}

# CARN_FROZEN_NOW is read from the one file that declares it, the way
# scripts/visual.sh does, so the shell cannot drift from the fixture
read_pins() {
  frozen_now=$(node --input-type=module -e \
    'import { frozenNow } from "./dist/test/support/fixture-repos.js";
     process.stdout.write(frozenNow);' 2>/dev/null)
  local weights
  weights=$(node --input-type=module -e \
    'import { fontBytes, stylesheetWireBytes } from "./dist/src/html/wire-weight.js";
     process.stdout.write(`${fontBytes}\n${stylesheetWireBytes}\n`);' 2>/dev/null)
  font_bytes=$(printf '%s\n' "$weights" | sed -n 1p)
  sheet_wire=$(printf '%s\n' "$weights" | sed -n 2p)
  [ -n "$frozen_now" ] && [ -n "$font_bytes" ] && [ -n "$sheet_wire" ]
}

# what a visitor downloads on a cold cache: the document at gzip level 5,
# the served sheet at the same level, and the three faces counted whole.
# < redirects so gzip stores no filename, which the in-process figure has no
# room for either
wire_bytes() {
  local zipped
  zipped=$(gzip -5 -c < "$1" | wc -c | tr -d ' ')
  printf '%s' "$((zipped + font_bytes + sheet_wire))"
}

# $1 = raw origin, empty for none. sets launch_pid, launch_http, launch_ssh
launch() {
  launch_ssh=$(free_port)
  launch_http=$(free_port)
  [ -n "$launch_ssh" ] && [ -n "$launch_http" ] || return 1
  # only the daemon sees the counting shim; the script's own git is real
  PATH="$shim:$PATH" DATABASE_URL="$scratch_url" CARN_REPO_ROOT="$repo_root" \
    CARN_SSH_HOST_KEY="$host_key" CARN_SSH_HOST=127.0.0.1 \
    CARN_SSH_PORT="$launch_ssh" HOST=127.0.0.1 PORT="$launch_http" \
    CARN_FROZEN_NOW="$frozen_now" CARN_RAW_ORIGIN="$1" \
    node dist/src/index.js > "$work/daemon-$launch_http.log" 2>&1 &
  launch_pid=$!
  local waited=0
  while [ "$waited" -lt 80 ]; do
    kill -0 "$launch_pid" 2>/dev/null || return 1
    # ssh2.Server has no .listening at runtime, so poll the ports themselves
    if nc -z 127.0.0.1 "$launch_ssh" 2>/dev/null && nc -z 127.0.0.1 "$launch_http" 2>/dev/null; then
      return 0
    fi
    sleep 0.25
    waited=$((waited + 1))
  done
  return 1
}

start_daemon() {
  launch "" || return 1
  daemon_pid=$launch_pid
  http_port=$launch_http
  ssh_port=$launch_ssh
  return 0
}

# a second daemon on the same database and repo root, differing only in
# CARN_RAW_ORIGIN, so check 5 can assert both halves without a restart
start_raw_daemon() {
  launch "$RAW_ORIGIN" || return 1
  raw_pid=$launch_pid
  raw_port=$launch_http
  return 0
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
raw_ok=0
seed_ok=0
pins_ok=0
frozen_now=""
font_bytes=""
sheet_wire=""
sheet_href=""
root_sha=""
tip_sha=""

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
# Verify 1e

[brand](docs/BRAND.md) is relative, and so is this diagram:

![arch](docs/arch.png)

[external](https://example.com/x)
[anchor](#notes)
[query](?all=1)
[root-relative](/r/verify1e)

## Notes

| Ref | Kind |
| --- | --- |
| main | branch |
README
}

# two real PNGs: one small enough to inline first-party, one of noise that
# deflate cannot shrink, so it lands over the room the budget leaves
write_pngs() {
  node --input-type=module -e '
    import { writeFileSync } from "node:fs";
    import { deflateSync } from "node:zlib";

    const table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    const crc = (buf) => {
      let c = -1;
      for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
      return (c ^ -1) >>> 0;
    };
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const sum = Buffer.alloc(4);
      sum.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, sum]);
    };
    // a murmur finalizer, not an LCG: deflate finds the period in an LCG
    // and shrinks the noise 6:1, which puts the big one back under the cap
    const noise = (i) => {
      let h = Math.imul(i, 2654435761) >>> 0;
      h ^= h >>> 15;
      h = Math.imul(h, 2246822507) >>> 0;
      h ^= h >>> 13;
      h = Math.imul(h, 3266489909) >>> 0;
      return (h ^ (h >>> 16)) & 0xff;
    };
    const png = (side, noisy) => {
      const head = Buffer.alloc(13);
      head.writeUInt32BE(side, 0);
      head.writeUInt32BE(side, 4);
      head[8] = 8;
      head[9] = 2;
      const stride = side * 3 + 1;
      const rows = Buffer.alloc(side * stride);
      for (let y = 0; y < side; y += 1) {
        for (let x = 1; x < stride; x += 1) {
          const at = y * stride + x;
          rows[at] = noisy ? noise(at) : 0x2a;
        }
      }
      return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", head),
        chunk("IDAT", deflateSync(rows)),
        chunk("IEND", Buffer.alloc(0)),
      ]);
    };

    writeFileSync(process.argv[1], png(8, false));
    writeFileSync(process.argv[2], png(8, false));
    writeFileSync(process.argv[3], png(160, true));
  ' -- "$1" "$2" "$3"
}

build_seed() {
  local top="$seed/$REPO_NAME"
  mkdir -p "$top/docs" "$top/src" "$top/$NESTED_DIR" "$repo_root" || return 1

  write_readme "$top/README.md"
  printf '# Brand\n\nOne accent, no motion.\n' > "$top/docs/BRAND.md"
  printf '{ "name": "%s" }\n' "$REPO_NAME" > "$top/package.json"
  printf 'export const seeded = true;\n' > "$top/src/index.ts"
  printf 'export const at = "%s";\n' "$DEEP_PATH" > "$top/$DEEP_PATH"

  local i
  for i in $(seq 1 $((NESTED_ROWS - 1))); do
    printf 'export const mod%02d = %d;\n' "$i" "$i" > "$top/$NESTED_DIR/mod$(printf '%02d' "$i").ts"
  done

  # over the computed source cap, which sits near 70 KB of source
  seq 1 3000 \
    | awk '{ printf "export const item%04d = { id: %d, name: \"row %d\" };\n", $1, $1, $1 }' \
    > "$top/big.ts"

  # a NUL in the first 8000 bytes is git's own heuristic, and this is all NUL
  head -c 512 /dev/zero > "$top/small.bin" || return 1

  write_pngs "$top/logo.png" "$top/docs/arch.png" "$top/wide.png" || return 1

  seed_git "$SEED_AT" "$top" init -q -b main > /dev/null 2>&1 || return 1
  seed_git "$SEED_AT" "$top" add -A > /dev/null 2>&1 || return 1

  # a gitlink without a submodule: mode 160000 is the whole of the detection
  seed_git "$SEED_AT" "$top" update-index --add \
    --cacheinfo "160000,0000000000000000000000000000000000000001,vendor/lib" \
    > /dev/null 2>&1 || return 1
  seed_git "$SEED_AT" "$top" commit -q -m "Lay the tree down" > /dev/null 2>&1 || return 1

  # a lightweight tag early, and more commits than one log page holds
  seed_git "$SEED_AT" "$top" tag v1.0.0 > /dev/null 2>&1 || return 1

  # never `commit -a`: the gitlink has no directory in the working tree, so
  # a staging pass over every tracked path reads it as a deletion
  for i in $(seq 1 $((ROW_CAP + 6))); do
    local at="2026-01-06T0$((i % 6)):$(printf '%02d' "$i"):00Z"
    printf 'export const step%02d = %d;\n' "$i" "$i" >> "$top/src/index.ts"
    seed_git "$at" "$top" add -- src/index.ts > /dev/null 2>&1 || return 1
    seed_git "$at" "$top" commit -q -m "Take step $i" > /dev/null 2>&1 || return 1
    if [ "$i" = "3" ]; then
      seed_git "$at" "$top" branch topic > /dev/null 2>&1 || return 1
    fi
  done

  seed_git "2026-01-07T10:00:00Z" "$top" tag -a v1.1.0 -m "The first release" \
    > /dev/null 2>&1 || return 1
  return 0
}

echo "Phase 1e exit checks"
echo

# taken before any work, so check 31 can prove the run added nothing
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

if [ "$build_ok" = 1 ] && read_pins; then
  pins_ok=1
fi

if setup_scratch; then
  scratch_ok=1
else
  scratch_why=$(tail -3 "$work/scratch.err" "$work/scratch.migrate" 2>/dev/null | tail -4)
fi

admin_key="$work/admin_key"
ssh-keygen -t ed25519 -N '' -C "admin@carn.invalid" -f "$admin_key" -q < /dev/null > /dev/null 2>&1

seed_built=0
if [ "$build_ok" = 1 ] && build_seed; then
  seed_built=1
fi

# ---------------------------------------------------------------------------
# 2
readonly TITLE_2="a blob renders as class-based highlight from the cached sheet"
if require_db 2 "$TITLE_2" && require_build 2 "$TITLE_2" && require_scratch 2 "$TITLE_2"; then
  if [ "$pins_ok" != 1 ]; then
    record FAIL 2 "$TITLE_2" "the pinned clock and weights could not be read from dist"
  elif [ "$seed_built" != 1 ]; then
    record FAIL 2 "$TITLE_2" "the seed repo could not be built"
  elif ! write_shim; then
    record FAIL 2 "$TITLE_2" "no executable git shim could be written, so checks 8, 9 and 11 could not count"
  else
    DATABASE_URL="$scratch_url" npm run key:add -- "$admin_key.pub" carn-verify \
      > "$work/2.key" 2>&1
    key_status=$?
    if [ "$key_status" -ne 0 ]; then
      record FAIL 2 "$TITLE_2" "key:add failed: $(tail -3 "$work/2.key")"
    elif ! start_daemon; then
      record FAIL 2 "$TITLE_2" "the daemon did not start: $(tail -5 "$work/daemon-$launch_http.log" 2>/dev/null)"
    else
      daemon_ok=1
      as_user "$admin_key" git -C "$seed/$REPO_NAME" push "$(ssh_url "$REPO_NAME")" \
        'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*' \
        > "$work/2.push" 2>&1
      push_status=$?
      if [ "$push_status" -ne 0 ]; then
        record FAIL 2 "$TITLE_2" "the seed push exited $push_status: $(tail -5 "$work/2.push")"
      else
        seed_ok=1
        # push-to-create takes the column default, which is real now()
        psql_scratch -c "update repos set created_at = '$SEED_AT'" > /dev/null 2>&1
        start_raw_daemon && raw_ok=1

        status=$(fetch_page "/r/$REPO_NAME/blob/main/src/index.ts" "$work/blob-text")
        wrong=""
        grep -qF '<code class="hljs language-typescript">' "$work/blob-text.body" \
          || wrong="$wrong the code block carries no class-based hljs language;"
        [ "$(matches "$work/blob-text.body" 'class="hljs-[a-z-]+"')" -gt 3 ] \
          || wrong="$wrong fewer than four hljs token spans reached the body;"
        grep -qE '<style|style="' "$work/blob-text.body" \
          && wrong="$wrong the page carries an inline style;"
        sheet_href=$(grep -oE 'href="/[^"]*\.css"' "$work/blob-text.body" | head -1 \
          | sed 's/href="//;s/"$//')
        [ -n "$sheet_href" ] || wrong="$wrong the page links no stylesheet;"
        if [ "$status" != "200" ]; then
          record FAIL 2 "$TITLE_2" "the blob answered ${status:-nothing}: $(tail -3 "$work/blob-text.err")"
        elif [ -n "$wrong" ]; then
          record FAIL 2 "$TITLE_2" "$wrong"
        else
          contract 2 "$TITLE_2" 3 "200, class-based markup and the theme in $sheet_href" \
            blob-page syntax-palette -- \
            "a file under the cap renders whole, with no notice and no hatch" \
            "every hljs class the sheet colors resolves to one of four tokens" \
            "every selector in the block names a real highlight.js class"
        fi
      fi
    fi
  fi
fi

# every page this run measures, fetched once and read by several checks
if [ "$seed_ok" = 1 ]; then
  root_sha=$(git -C "$seed/$REPO_NAME" rev-list --max-parents=0 HEAD | head -1)
  tip_sha=$(git -C "$seed/$REPO_NAME" rev-parse HEAD)
  fetch_page "/" "$work/index" > "$work/index.status"
  fetch_page "/r/$REPO_NAME" "$work/show" > "$work/show.status"
  fetch_page "/r/$REPO_NAME/blob/main/big.ts" "$work/blob-cut" > "$work/blob-cut.status"
  fetch_page "/r/$REPO_NAME/blob/main/logo.png" "$work/blob-img" > "$work/blob-img.status"
  fetch_page "/r/$REPO_NAME/blob/main/wide.png" "$work/blob-wide" > "$work/blob-wide.status"
  fetch_page "/r/$REPO_NAME/blob/main/small.bin" "$work/blob-bin" > "$work/blob-bin.status"
  fetch_page "/r/$REPO_NAME/blob/main/$DEEP_PATH" "$work/blob-deep" > "$work/blob-deep.status"
  fetch_page "/r/$REPO_NAME/branches" "$work/branches" > "$work/branches.status"
  fetch_page "/r/$REPO_NAME/tags" "$work/tags" > "$work/tags.status"
fi

# 3
readonly TITLE_3="all four blob cases behave, and the cap is computed"
if require_daemon 3 "$TITLE_3" && require_seed 3 "$TITLE_3"; then
  wrong=""
  [ "$(cat "$work/blob-cut.status")" = "200" ] \
    || wrong="$wrong the over-cap text blob answered $(cat "$work/blob-cut.status");"
  grep -qE '<p class="t-note" id="blob-cut">Showing the first [0-9,]+ lines of 3,000\.</p>' \
    "$work/blob-cut.body" || wrong="$wrong the over-cap text blob shows no cut notice;"
  grep -qF 'id="blob-cut"' "$work/blob-text.body" \
    && wrong="$wrong the under-cap text blob was cut;"
  grep -qF '<img class="preview"' "$work/blob-img.body" \
    || wrong="$wrong the under-cap raster did not inline;"
  grep -qF 'Too large to show here.' "$work/blob-wide.body" \
    || wrong="$wrong the over-cap raster did not decline;"
  grep -qF 'Not shown here.' "$work/blob-bin.body" \
    || wrong="$wrong the binary blob did not decline;"
  if [ -n "$wrong" ]; then
    record FAIL 3 "$TITLE_3" "$wrong"
  else
    shown=$(sed -nE 's/.*Showing the first ([0-9,]+) lines of 3,000\..*/\1/p' \
      "$work/blob-cut.body" | head -1)
    contract 3 "$TITLE_3" 6 "3,000 source lines cut to $shown over the wire" \
      blob-page -- \
      "a file under the cap renders whole, with no notice and no hatch" \
      "a file over the cap is cut on a line boundary and says so" \
      "a raster under the cap inlines first-party, eagerly, with no alt" \
      "an oversize raster and a binary decline in the file's own words" \
      "the cap is computed from the budget, so a bigger sheet shrinks it" \
      "a bigger stylesheet renders fewer lines, not just a smaller number"
  fi
fi

# 4
readonly TITLE_4="a binary never renders as text and a small image is first-party"
if require_daemon 4 "$TITLE_4" && require_seed 4 "$TITLE_4"; then
  wrong=""
  asset=$(grep -oE '<img class="preview" src="[^"]+"' "$work/blob-img.body" \
    | sed 's/.*src="//;s/"$//')
  case "$asset" in
    "/r/$REPO_NAME/blob-asset/"*.png) ;;
    *) wrong="$wrong the preview src is '${asset:-absent}', not the repo's own asset route;" ;;
  esac
  grep -qF '<pre class="src"' "$work/blob-bin.body" \
    && wrong="$wrong the binary blob rendered a source block;"
  grep -qF '<pre class="src"' "$work/blob-wide.body" \
    && wrong="$wrong the oversize raster rendered a source block;"
  if [ -n "$wrong" ]; then
    record FAIL 4 "$TITLE_4" "$wrong"
  else
    asset_status=$(fetch_page "$asset" "$work/asset")
    asset_type=$(grep -i '^content-type:' "$work/asset.head" | sed 's/^[^:]*: *//' | tr -d '\r')
    if [ "$asset_status" != "200" ]; then
      record FAIL 4 "$TITLE_4" "$asset answered ${asset_status:-nothing}"
    elif [ "$asset_type" != "image/png" ]; then
      record FAIL 4 "$TITLE_4" "$asset served '${asset_type:-nothing}', not image/png"
    else
      contract 4 "$TITLE_4" 4 "$asset served image/png first-party" \
        blob-page repo-page -- \
        "a raster under the cap inlines first-party, eagerly, with no alt" \
        "an svg blob renders as source and never as an inline image" \
        "an oversize raster and a binary decline in the file's own words" \
        "the asset route resolves a path to the raster its bytes say it is"
    fi
  fi
fi

# 5
# two daemons differing only in CARN_RAW_ORIGIN, so both halves are read
# off a real response rather than one of them being argued from the source
readonly TITLE_5="the escape hatches are absent unset and point at the origin set"
if require_daemon 5 "$TITLE_5" && require_seed 5 "$TITLE_5"; then
  if [ "$raw_ok" != 1 ]; then
    record FAIL 5 "$TITLE_5" "the second daemon, the one with CARN_RAW_ORIGIN set, did not start"
  else
    wrong=""
    grep -qF "$RAW_ORIGIN" "$work/blob-cut.body" \
      && wrong="$wrong the unset daemon rendered a raw-origin link;"
    grep -qF 'Show entire file' "$work/blob-cut.body" \
      && wrong="$wrong the unset daemon rendered the text hatch;"
    grep -qF 'Open raw' "$work/blob-wide.body" \
      && wrong="$wrong the unset daemon rendered the object hatch;"
    grep -qF 'id="blob-cut"' "$work/blob-cut.body" \
      || wrong="$wrong the unset daemon dropped the cut notice with the hatch;"
    fetch_url "$(raw_url "/r/$REPO_NAME/blob/main/big.ts")" "$work/raw-cut" > /dev/null
    fetch_url "$(raw_url "/r/$REPO_NAME/blob/main/wide.png")" "$work/raw-wide" > /dev/null
    grep -qF "href=\"$RAW_ORIGIN/$REPO_NAME/main/big.ts\">Show entire file" \
      "$work/raw-cut.body" || wrong="$wrong the set daemon's text hatch does not point at the origin;"
    grep -qF "href=\"$RAW_ORIGIN/$REPO_NAME/main/wide.png\">Open raw" \
      "$work/raw-wide.body" || wrong="$wrong the set daemon's object hatch does not point at the origin;"
    if [ -n "$wrong" ]; then
      record FAIL 5 "$TITLE_5" "$wrong"
    else
      contract 5 "$TITLE_5" 2 "absent on one daemon and pointing at $RAW_ORIGIN on the other" \
        blob-page -- \
        "the notice renders whether or not a raw origin is configured" \
        "the escape hatches are absent unset and point at the origin set"
    fi
  fi
fi

# 6
# the cursor is a sha in the query, and the two pages are disjoint: a
# --skip walk would repeat the boundary commit or drop it
readonly TITLE_6="the log paginates by sha cursor, and page two re-reads nothing"
if require_daemon 6 "$TITLE_6" && require_seed 6 "$TITLE_6"; then
  page1_status=$(fetch_page "/r/$REPO_NAME/commits" "$work/log1")
  cursor=$(grep -oE 'href="/r/'"$REPO_NAME"'/commits\?ref=main&amp;from=[0-9a-f]{40}"' \
    "$work/log1.body" | head -1 | sed 's/.*from=//;s/"$//')
  wrong=""
  [ "$page1_status" = "200" ] || wrong="$wrong page one answered $page1_status;"
  [ -n "$cursor" ] || wrong="$wrong page one carries no from= sha cursor;"
  grep -qF 'skip=' "$work/log1.body" && wrong="$wrong page one offers a skip= link;"
  if [ -z "$wrong" ]; then
    page2_status=$(fetch_page "/r/$REPO_NAME/commits?ref=main&from=$cursor" "$work/log2")
    [ "$page2_status" = "200" ] || wrong="$wrong page two answered $page2_status;"
    grep -oE '/commits/[0-9a-f]{40}' "$work/log1.body" | sort -u > "$work/log1.shas"
    grep -oE '/commits/[0-9a-f]{40}' "$work/log2.body" | sort -u > "$work/log2.shas"
    shared=$(comm -12 "$work/log1.shas" "$work/log2.shas" | grep -c .)
    one=$(grep -c . "$work/log1.shas")
    two=$(grep -c . "$work/log2.shas")
    [ "$one" = "$ROW_CAP" ] || wrong="$wrong page one lists $one commits, wanted $ROW_CAP;"
    [ "$two" -gt 0 ] || wrong="$wrong page two lists nothing;"
    [ "$shared" = "0" ] || wrong="$wrong the two pages share $shared sha(s);"
    grep -qF "$cursor" "$work/log2.shas" \
      || wrong="$wrong page two does not begin at the cursor it was given;"
    scoped=$(fetch_page "/r/$REPO_NAME/commits?ref=topic" "$work/log-topic")
    [ "$scoped" = "200" ] || wrong="$wrong ?ref=topic answered $scoped;"
  fi
  if [ -n "$wrong" ]; then
    record FAIL 6 "$TITLE_6" "$wrong"
  else
    contract 6 "$TITLE_6" 5 "page one $one commits, page two $two, $shared shared" \
      commit-log -- \
      "page two starts from the cursor rather than skipping to it" \
      "no commit is shown twice across the pages of one walk" \
      "the rendered pages repeat no sha either" \
      "the last page says so, and the pages before it do not" \
      "a ref scopes the log to that ref's own history"
  fi
fi

# 7
readonly TITLE_7="the commit page lists every file and inlines diffs while they fit"
if require_daemon 7 "$TITLE_7" && require_seed 7 "$TITLE_7"; then
  big_status=$(fetch_page "/r/$REPO_NAME/commits/$root_sha" "$work/commit-big")
  one_status=$(fetch_page "/r/$REPO_NAME/commits/$tip_sha" "$work/commit-one")
  wrong=""
  [ "$big_status" = "200" ] || wrong="$wrong the root commit answered $big_status;"
  [ "$one_status" = "200" ] || wrong="$wrong the tip commit answered $one_status;"
  big_files=$(occurrences "$work/commit-big.body" '<tr class="row">')
  one_files=$(occurrences "$work/commit-one.body" '<tr class="row">')
  # an inlined row anchors to the diff below it; the tail carries the
  # per-file route instead, so the two hrefs are what tell them apart
  inlined=$(occurrences "$work/commit-big.body" 'href="#f-')
  tail_links=$(matches "$work/commit-big.body" "/commits/$root_sha/[^\"]+")
  [ "$one_files" = "1" ] || wrong="$wrong the one-file commit lists $one_files file rows;"
  [ "$big_files" -gt 1 ] || wrong="$wrong the root commit lists $big_files file rows;"
  [ "$inlined" -gt 0 ] || wrong="$wrong the root commit inlined nothing at all;"
  [ "$tail_links" -gt 0 ] || wrong="$wrong the root commit inlined everything, so nothing was linked;"
  grep -qF 'href="#f-0"' "$work/commit-one.body" \
    || wrong="$wrong the one-file commit's row does not anchor to an inlined diff;"
  grep -qE '\+[0-9]+<span class="vh"> added</span>' "$work/commit-one.body" \
    || wrong="$wrong the one-file commit's row carries no counts;"
  grep -qF '<pre class="src diff"' "$work/commit-one.body" \
    || wrong="$wrong the one-file commit inlined no diff;"
  if [ -n "$wrong" ]; then
    record FAIL 7 "$TITLE_7" "$wrong"
  else
    contract 7 "$TITLE_7" 4 "$one_files file whole, $big_files listed with $inlined inlined and $tail_links linked" \
      commit -- \
      "an ordinary commit reports every path it touched, with its counts" \
      "a one-file commit renders whole, and still shows the file list" \
      "the diffs stop at the first file that would overrun, and the rest are links" \
      "the page a cutoff produces is really under the budget, measured"
  fi
fi

# 8
readonly TITLE_8="both ref lists are one for-each-ref, and every row links to the log"
if require_daemon 8 "$TITLE_8" && require_seed 8 "$TITLE_8"; then
  : > "$spawn_log"
  branch_status=$(fetch_page "/r/$REPO_NAME/branches" "$work/branches")
  branch_refs=$(grep -c 'for-each-ref' "$spawn_log")
  branch_spawns=$(spawns_of)
  : > "$spawn_log"
  tag_status=$(fetch_page "/r/$REPO_NAME/tags" "$work/tags")
  tag_refs=$(grep -c 'for-each-ref' "$spawn_log")
  wrong=""
  [ "$branch_status" = "200" ] || wrong="$wrong /branches answered $branch_status;"
  [ "$tag_status" = "200" ] || wrong="$wrong /tags answered $tag_status;"
  [ "$branch_refs" = "1" ] || wrong="$wrong the branch list cost $branch_refs for-each-ref call(s), wanted 1;"
  [ "$tag_refs" = "1" ] || wrong="$wrong the tag list cost $tag_refs for-each-ref call(s), wanted 1;"
  for ref in main topic; do
    grep -qF "href=\"/r/$REPO_NAME/commits?ref=$ref\"" "$work/branches.body" \
      || wrong="$wrong no branch row links the log scoped to $ref;"
  done
  for ref in v1.0.0 v1.1.0; do
    grep -qF "href=\"/r/$REPO_NAME/commits?ref=$ref\"" "$work/tags.body" \
      || wrong="$wrong no tag row links the log scoped to $ref;"
  done
  if [ -n "$wrong" ]; then
    record FAIL 8 "$TITLE_8" "$wrong"
  else
    contract 8 "$TITLE_8" 4 "one for-each-ref each, $branch_spawns spawn(s) for the branch page" \
      refs -- \
      "a branch list is one for-each-ref, not one call per branch" \
      "a tag list is one for-each-ref too, over the tag namespace" \
      "every row is three links to the log scoped to that ref" \
      "one page render costs one spawn"
  fi
fi

# 9
# the shim counts argv, so this separates one bounded walk from one walk
# per row: the pixels are identical and only the call count differs
readonly TITLE_9="the tree's subject and age come from one bounded log walk"
if require_daemon 9 "$TITLE_9" && require_seed 9 "$TITLE_9"; then
  : > "$spawn_log"
  tree_status=$(fetch_page "/r/$REPO_NAME/tree/main/$NESTED_DIR?all=1" "$work/tree")
  walks=$(grep -c 'name-status' "$spawn_log")
  bounded_walk=$(grep -c 'max-count' "$spawn_log")
  tree_spawns=$(spawns_of)
  filled=$(occurrences "$work/tree.body" '<td class="msg"><span>Lay the tree down</span></td>')
  wrong=""
  [ "$tree_status" = "200" ] || wrong="$wrong the tree answered $tree_status;"
  [ "$tree_spawns" -gt 0 ] || wrong="$wrong the shim recorded no call, so it never reached the daemon's PATH;"
  [ "$walks" = "1" ] || wrong="$wrong the listing cost $walks log --name-status call(s), wanted 1;"
  [ "$bounded_walk" -ge 1 ] || wrong="$wrong the walk carries no --max-count, so it is not bounded;"
  [ "$filled" -gt 0 ] || wrong="$wrong no row carries a subject from the walk;"
  grep -qE '<time datetime="2026-01-0[0-9]T' "$work/tree.body" \
    || wrong="$wrong no row carries an age from the walk;"
  if [ -n "$wrong" ]; then
    record FAIL 9 "$TITLE_9" "$wrong"
  else
    contract 9 "$TITLE_9" 2 "1 bounded walk, $tree_spawns spawn(s), $filled attributed row(s)" \
      tree-page -- \
      "a listing costs one ls-tree and one log, at every depth" \
      "the bounded walk attributes what it reaches and blanks the rest"
  fi
fi

# 10
# wire bytes, not document bytes: gzip level 5 is Caddy's encode default,
# the three faces count whole, and the served sheet is the minified one
readonly TITLE_10="every page fits the budget as wire bytes at gzip level 5"
if require_daemon 10 "$TITLE_10" && require_seed 10 "$TITLE_10"; then
  over=""
  widest=0
  widest_page=""
  for page in index show blob-text blob-cut blob-img blob-wide blob-bin blob-deep \
    branches tags log1 log2 commit-big commit-one tree; do
    [ -s "$work/$page.body" ] || continue
    weight=$(wire_bytes "$work/$page.body")
    if [ "$weight" -ge "$PAGE_BUDGET" ]; then
      over="$over $page is $weight B;"
    fi
    if [ "$weight" -gt "$widest" ]; then
      widest=$weight
      widest_page=$page
    fi
  done
  if [ -z "$sheet_href" ]; then
    over="$over no stylesheet href was read off a page, see check 2;"
    sheet_status=""
    served_sheet=""
  else
    sheet_status=$(fetch_page "$sheet_href" "$work/sheet")
    served_sheet=$(gzip -5 -c < "$work/sheet.body" | wc -c | tr -d ' ')
  fi
  [ "$sheet_status" = "200" ] || over="$over the stylesheet answered ${sheet_status:-nothing};"
  [ "$served_sheet" = "$sheet_wire" ] \
    || over="$over the served sheet is $served_sheet B on the wire, the budget counted $sheet_wire;"
  grep -qF '  ' "$work/sheet.body" && over="$over the served sheet is not minified;"
  if [ -n "$over" ]; then
    record FAIL 10 "$TITLE_10" "$over"
  else
    contract 10 "$TITLE_10" 8 "widest is $widest_page at $widest B of $PAGE_BUDGET" \
      blob-page commit-log refs tree-page repo-page assets -- \
      "every rendered blob page fits the budget as real gzip-5 wire bytes" \
      "every commit log page fits the budget as gzip-5 wire bytes" \
      "every state fits the budget as gzip-5 wire bytes" \
      "a tree page stays inside the weight budget" \
      "the repo page fits the weight budget as wire bytes, fonts in" \
      "the wire measurement is a compression, not a rename" \
      "the whole page fits the budget with both families, images, and the sheet" \
      "minifying is a serve-time transform that changes no rule"
  fi
fi

# 11
readonly TITLE_11="every new view renders under 12 spawn calls"
if require_daemon 11 "$TITLE_11" && require_seed 11 "$TITLE_11"; then
  over=""
  counted=""
  for view in "blob/main/big.ts" "tree/main/$NESTED_DIR" "commits" "branches" "tags"; do
    : > "$spawn_log"
    status=$(fetch_page "/r/$REPO_NAME/$view" "$work/spawn-probe")
    calls=$(spawns_of)
    counted="$counted $view=$calls"
    [ "$status" = "200" ] || over="$over $view answered $status;"
    [ "$calls" -gt 0 ] || over="$over $view recorded no call, so nothing was measured;"
    [ "$calls" -lt "$SPAWN_BUDGET" ] || over="$over $view cost $calls spawn(s);"
  done
  : > "$spawn_log"
  status=$(fetch_page "/r/$REPO_NAME/commits/$tip_sha" "$work/spawn-probe")
  calls=$(spawns_of)
  counted="$counted commit=$calls"
  [ "$calls" -gt 0 ] && [ "$calls" -lt "$SPAWN_BUDGET" ] \
    || over="$over the commit page cost $calls spawn(s);"
  if [ -n "$over" ]; then
    record FAIL 11 "$TITLE_11" "$over"
  else
    contract 11 "$TITLE_11" 5 "against a budget of $SPAWN_BUDGET:$counted" \
      repo-page commit commit-log refs tree-page -- \
      "a repo page render stays inside the spawn budget" \
      "one commit page costs three spawns whatever it touched" \
      "one render costs one spawn" \
      "one page render costs one spawn" \
      "a listing costs one ls-tree and one log, at every depth"
  fi
fi

# 12
# the first request pays for the module graph, so the reading is the best
# of three warm ones. the daemon's git is the counting shim, which is a
# shell in front of every spawn, so this measures more than production will
readonly TITLE_12="a warm blob and a warm commit answer inside 100 ms"
if require_daemon 12 "$TITLE_12" && require_seed 12 "$TITLE_12"; then
  slow=""
  timings=""
  for probe in "blob/main/src/index.ts" "commits/$tip_sha"; do
    best=""
    for _ in 1 2 3 4; do
      taken=$(curl -sS --path-as-is --max-time 60 -o /dev/null \
        -w '%{time_starttransfer}' "$(page_url "/r/$REPO_NAME/$probe")" 2>/dev/null)
      ms=$(printf '%s\n' "$taken" | awk '{ printf "%d", $1 * 1000 }')
      if [ -z "$best" ] || [ "$ms" -lt "$best" ]; then best=$ms; fi
    done
    timings="$timings ${probe%%/*}=${best}ms"
    [ "${best:-9999}" -lt "$TTFB_LIMIT_MS" ] \
      || slow="$slow $probe answered in ${best}ms;"
  done
  if [ -n "$slow" ]; then
    record FAIL 12 "$TITLE_12" "$slow against a $TTFB_LIMIT_MS ms budget"
  else
    record PASS 12 "$TITLE_12" "warm:$timings"
  fi
fi

# 13
# served over real http, not set into about:blank, so the audit measures
# Carn Sans and Carn Mono rather than whatever the host falls back to
contract 13 "zero axe violations across both render paths, on every new view" 145 "" \
  axe

# 14
# PLAN 00 says every index view is a table, and this wave brought the code
# to it. the overlay went with the <li>: the hit area is each cell's own
# link now, which is what lets the subject and the age be links of their own
readonly TITLE_14="both lists are tables with three links per row, and no row overlay"
if require_daemon 14 "$TITLE_14" && require_seed 14 "$TITLE_14"; then
  wrong=""
  for page in branches tags; do
    grep -qF '<table class="tbl refs">' "$work/$page.body" \
      || wrong="$wrong /$page is not a table;"
    grep -qE '<ul class="refs"' "$work/$page.body" \
      && wrong="$wrong /$page still carries Row list markup;"
    [ "$(occurrences "$work/$page.body" '<tr class="row">')" -gt 0 ] \
      || wrong="$wrong /$page draws no rows;"
  done
  grep -qE '\.nm::after' src/html/styles.ts \
    && wrong="$wrong the sheet brought the row overlay back, and it swallows two links;"
  if [ -n "$wrong" ]; then
    record FAIL 14 "$TITLE_14" "$wrong"
  else
    contract 14 "$TITLE_14" 3 "both served lists are tables, three links per row" \
      refs commit-log -- \
      "both lists are tables with a caption and a header row" \
      "three links per row, one per cell, all to the ref's own log" \
      "a row carries three links to the commit, one per cell"
  fi
fi

# 15
# the trail is followed, not merely counted: an href that looks like a url
# is the defect worth catching, and only a fetch tells them apart
readonly TITLE_15="every breadcrumb ancestor on a deep blob resolves to a real route"
if require_daemon 15 "$TITLE_15" && require_seed 15 "$TITLE_15"; then
  tr '\n' ' ' < "$work/blob-deep.body" \
    | sed 's/.*<nav aria-label="Breadcrumb">//' \
    | sed 's|</nav>.*||' > "$work/crumbs"
  grep -oE 'href="[^"]+"' "$work/crumbs" | sed 's/href="//;s/"$//' > "$work/crumb.hrefs"
  ancestors=$(grep -c . "$work/crumb.hrefs")
  wrong=""
  [ "$(cat "$work/blob-deep.status")" = "200" ] \
    || wrong="$wrong the deep blob answered $(cat "$work/blob-deep.status");"
  [ "$ancestors" = "5" ] \
    || wrong="$wrong the trail carries $ancestors ancestor link(s), wanted 5;"
  grep -qF '<span aria-hidden="true"> » </span>' "$work/crumbs" \
    || wrong="$wrong the separator is not real aria-hidden dom text;"
  grep -qF '<span class="here">deep.ts</span>' "$work/crumbs" \
    || wrong="$wrong the current segment is not an unlinked here span;"
  grep -qF '<li class="fold" aria-hidden="true">' "$work/crumbs" \
    || wrong="$wrong a six-segment trail renders no fold;"
  grep -qF '<li class="mid">' "$work/crumbs" \
    || wrong="$wrong no segment is marked as collapsible middle;"
  followed=0
  while IFS= read -r href; do
    [ -n "$href" ] || continue
    followed=$((followed + 1))
    reached=$(fetch_page "$href" "$work/crumb-follow")
    [ "$reached" = "200" ] || wrong="$wrong $href answered ${reached:-nothing};"
  done < "$work/crumb.hrefs"
  if [ -n "$wrong" ]; then
    record FAIL 15 "$TITLE_15" "$wrong"
  else
    contract 15 "$TITLE_15" 6 "$followed ancestor link(s) followed, all 200" \
      breadcrumb -- \
      "the separator is real dom text, and every one is aria-hidden" \
      "ancestors are links, and the current segment is not" \
      "every path segment carries the tree route at its own depth" \
      "every ancestor link on a blob three levels deep answers 200" \
      "the collapse drops the middle from the layout and the a11y tree" \
      "the trail from a nested tree page climbs to the repo page"
  fi
fi

# 16
# two doors, and the second is the one nothing in TypeScript would catch:
# namePattern and the repos_name_format CHECK are separate copies of 40
readonly TITLE_16="40 is accepted and 41 refused, by the app and by the database"
if require_daemon 16 "$TITLE_16" && require_scratch 16 "$TITLE_16"; then
  at_cap=$(printf 'a%.0s' $(seq "$NAME_CAP"))
  over_cap=$(printf 'a%.0s' $(seq $((NAME_CAP + 1))))
  wrong=""

  cap_status=$(fetch_page "/r/$at_cap" "$work/16a")
  over_status=$(fetch_page "/r/$over_cap" "$work/16b")
  [ "$cap_status" = "404" ] || wrong="$wrong a $NAME_CAP-character name answered $cap_status;"
  [ "$over_status" = "404" ] || wrong="$wrong a $((NAME_CAP + 1))-character name answered $over_status;"
  grep -qF "There&#39;s no repo named $at_cap on this server." "$work/16a.body" \
    || wrong="$wrong a $NAME_CAP-character name was refused as a bad name, not looked up;"
  grep -qF "$BAD_NAME" "$work/16b.body" \
    || wrong="$wrong a $((NAME_CAP + 1))-character name drew no bad-name page;"
  grep -qF "$BAD_NAME_NEXT" "$work/16b.body" \
    || wrong="$wrong the refusal copy does not name $NAME_CAP characters;"

  took=$(psql_scratch -c \
    "insert into repos (id, owner_id, name, created_at) select gen_random_uuid(), id, '$at_cap', now() from users limit 1" 2>&1)
  refused=$(psql_scratch -c \
    "insert into repos (id, owner_id, name, created_at) select gen_random_uuid(), id, '$over_cap', now() from users limit 1" 2>&1)
  psql_scratch -c "delete from repos where name = '$at_cap'" > /dev/null 2>&1
  printf '%s' "$took" | grep -qi 'error' \
    && wrong="$wrong the table refused a $NAME_CAP-character name: $took;"
  printf '%s' "$refused" | grep -q 'repos_name_format' \
    || wrong="$wrong the table took a $((NAME_CAP + 1))-character name: ${refused:-no error};"

  # the refusal copy is Nick's; only the number is this phase's to move.
  # the quantifier is one anchor plus a repeat, so the cap is {0,39}
  for source in src/html/error-page.ts src/ssh/exec.ts; do
    grep -qF "up to $NAME_CAP characters" "$source" \
      || wrong="$wrong $source's refusal copy does not name $NAME_CAP characters;"
  done
  grep -qE '\{0,39\}' src/repos/resolve.ts \
    || wrong="$wrong namePattern is not a {0,39} repeat;"
  find prisma/migrations -name 'migration.sql' -exec cat {} + \
    | tr '\n' ' ' | grep -qE 'repos_name_format[^;]*\{0,39\}' \
    || wrong="$wrong no migration's repos_name_format CHECK is a {0,39} repeat;"

  if [ -n "$wrong" ]; then
    record FAIL 16 "$TITLE_16" "$wrong"
  else
    record PASS 16 "$TITLE_16" \
      "$NAME_CAP looked up and $((NAME_CAP + 1)) refused at the route, and the CHECK refused $((NAME_CAP + 1)) directly"
  fi
fi

# 17
readonly TITLE_17="renderPaths is pinned field for field, and this counts the test"
pins=$(grep -c 'deepStrictEqual' test/contract/render-paths.contract.ts)
if [ "$pins" -lt 1 ]; then
  record FAIL 17 "$TITLE_17" "render-paths.contract.ts makes no deepStrictEqual assertion"
else
  contract 17 "$TITLE_17" 1 "$pins deepStrictEqual assertion(s)" \
    render-paths
fi

# 18
# two runs, one per color scheme, and two breakpoints inside each: tuffgal
# pins colorScheme per run, so a single run leaves one palette unphotographed
readonly TITLE_18="the tuffgal stories pass at 375 and 1440, in both palettes"
if require_db 18 "$TITLE_18"; then
  npm run visual > "$work/18" 2>&1
  visual_status=$?
  schemes=$(grep -c '^== \(dark\|light\) ==$' "$work/18")
  desktops=$(grep -c 'on "desktop" breakpoint' "$work/18")
  mobiles=$(grep -c 'on "mobile" breakpoint' "$work/18")
  frozen_pinned=$(grep -c 'frozenTime' tuffgal.config.ts)
  wide=$(grep -c 'width: 1440' tuffgal.config.ts)
  narrow=$(grep -c 'width: 375' tuffgal.config.ts)
  if [ "$visual_status" -ne 0 ]; then
    record FAIL 18 "$TITLE_18" "npm run visual exited $visual_status: $(grep -m1 'tuffgal error' "$work/18" || tail -3 "$work/18")"
  elif [ "$schemes" != "2" ]; then
    record FAIL 18 "$TITLE_18" "$schemes of 2 color-scheme runs started, so a palette went unphotographed"
  elif [ "$desktops" != "2" ] || [ "$mobiles" != "2" ]; then
    record FAIL 18 "$TITLE_18" "$desktops desktop and $mobiles mobile summaries, wanted 2 of each"
  elif [ "$wide" -lt 1 ] || [ "$narrow" -lt 1 ] || [ "$frozen_pinned" -lt 1 ]; then
    record FAIL 18 "$TITLE_18" "tuffgal.config.ts declares 1440:$wide, 375:$narrow, frozenTime:$frozen_pinned"
  else
    record PASS 18 "$TITLE_18" "2 palettes x 2 breakpoints, against the pinned fixture and $frozen_now"
  fi
fi

# 19
readonly TITLE_19="captureGit, parseLsTree and mayWrite each have one definition"
wrong=""
for pair in "captureGit:src/git/capture.ts" "parseLsTree:src/git/ls-tree.ts" \
  "mayWrite:src/repos/access.ts"; do
  name=${pair%%:*}
  home=${pair##*:}
  defs=$(git grep --untracked -cE "^export (async )?function $name\(" -- src | grep -c .)
  any=$(git grep --untracked -cE "function $name\(" -- src | grep -c .)
  [ "$defs" = "1" ] || wrong="$wrong $name is exported from $defs file(s) under src, wanted 1;"
  [ "$any" = "1" ] || wrong="$wrong $name is defined in $any file(s) under src, wanted 1;"
  git grep --untracked -qE "^export (async )?function $name\(" -- "$home" \
    || wrong="$wrong $name is not defined in $home;"
done
# nothing under src re-implements the spawn-and-collect body: the raw
# spawnGit is for the two streaming transports, and capture.ts wraps it
spawners=$(git grep --untracked -l 'spawnGit' -- src | sort | tr '\n' ' ')
[ "$spawners" = "src/git/capture.ts src/git/spawn.ts src/routes/git-http.ts src/ssh/exec.ts " ] \
  || wrong="$wrong spawnGit reaches '$spawners', which is not capture plus the two transports;"
sshdb=$(git grep --untracked -l 'from "\.\./db\.js"' -- src/ssh | sort | tr '\n' ' ')
[ "$sshdb" = "src/ssh/server.ts " ] \
  || wrong="$wrong db is imported under src/ssh by '$sshdb', wanted server.ts alone;"
if [ -n "$wrong" ]; then
  record FAIL 19 "$TITLE_19" "$wrong"
else
  record PASS 19 "$TITLE_19" "one definition each, and src/ssh touches Prisma only in server.ts"
fi

# 20
# spelled as a pattern so this script is not itself a hit
spawn_shell='shell:[[:space:]]*true'
printf 'spawn(cmd, { %s: %s })\n' shell true > "$work/20.control"
if ! grep -qE "$spawn_shell" "$work/20.control"; then
  record FAIL 20 "no shell-enabled spawn in source" "the pattern does not match a known violation; it cannot gate"
else
  # source only: docs quote the rule, --untracked sees uncommitted files
  hits=$(git grep --untracked -nE "$spawn_shell" -- src test scripts prisma prisma.config.ts)
  if [ -z "$hits" ]; then
    record PASS 20 "no shell-enabled spawn in source"
  else
    record FAIL 20 "no shell-enabled spawn in source" "$hits"
  fi
fi

# 21
# a git pathspec * crosses /, so src/**/*.ts would skip src/config.ts
readonly TITLE_21="every .ts under src, test and scripts opens with the SPDX line"
spdx_line='// SPDX-License-Identifier: AGPL-3.0-or-later'
# positive control: prove the comparison below can tell a header from none
printf '%s\n' "$spdx_line" > "$work/21.good"
printf 'no header\n' > "$work/21.bad"
if [ "$(head -1 "$work/21.good")" != "$spdx_line" ] || [ "$(head -1 "$work/21.bad")" = "$spdx_line" ]; then
  record FAIL 21 "$TITLE_21" "the header comparison does not discriminate; it cannot gate"
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
    record FAIL 21 "$TITLE_21" "no source files enumerated"
  elif [ "$source_count" != "$found_count" ]; then
    record FAIL 21 "$TITLE_21" "git listed $source_count files, find listed $found_count"
  elif [ -n "$unstamped" ]; then
    record FAIL 21 "$TITLE_21" "missing on:$unstamped"
  else
    record PASS 21 "$TITLE_21" "$source_count files checked"
  fi
fi

# 22
readonly TITLE_22="dependencies are 1d's plus highlight.js, and no more"
if node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"))
  const budget = {
    dependencies: ["fastify", "@prisma/client", "@prisma/adapter-pg", "ssh2", "markdown-it", "highlight.js"],
    devDependencies: ["prisma", "typescript", "@types/node", "squawk-cli", "@biomejs/biome", "@types/ssh2", "axe-core", "playwright", "tuffgal"],
  }
  const over = []
  for (const [field, allowed] of Object.entries(budget)) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (!allowed.includes(name)) over.push(`${name} (${field})`)
    }
  }
  if (over.length) { console.error("1e adds one, but found: " + over.join(", ")); process.exit(1) }
  if (!pkg.dependencies?.["highlight.js"]) { console.error("highlight.js is not in dependencies"); process.exit(1) }
  for (const name of ["shiki", "@types/highlight.js", "prismjs"]) {
    if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) { console.error(`${name} is installed`); process.exit(1) }
  }
' > "$work/22" 2>&1; then
  record PASS 22 "$TITLE_22"
else
  record FAIL 22 "$TITLE_22" "$(cat "$work/22")"
fi

# 23
# a zero-match glob exits 0, so the file list is built before linting
readonly TITLE_23="squawk finds no issues in the migrations"
sql=()
while IFS= read -r file; do
  sql+=("$file")
done < <(find prisma/migrations -name '*.sql' 2>/dev/null | sort)
if [ "${#sql[@]}" -eq 0 ]; then
  record FAIL 23 "$TITLE_23" "no migration SQL found to lint"
elif npx squawk "${sql[@]}" > "$work/23" 2>&1; then
  record PASS 23 "$TITLE_23" "${#sql[@]} file(s) linted"
else
  record FAIL 23 "$TITLE_23" "$(tail -10 "$work/23")"
fi

# 25
# out of order on purpose: it reads the served repo page, and the daemon
# comes down before check 24 takes the ports and the scratch database
rel_verdict=""
rel_detail=""
if [ "$seed_ok" = 1 ]; then
  bad=""
  for rewritten in \
    "<a href=\"/r/$REPO_NAME/blob/main/docs/BRAND.md\">brand</a>" \
    "<img src=\"/r/$REPO_NAME/asset/main/docs/arch.png\" alt=\"arch\""; do
    grep -qF "$rewritten" "$work/show.body" || bad="$bad missing '$rewritten';"
  done
  for untouched in '<a href="https://example.com/x"' '<a href="#notes">anchor</a>' \
    '<a href="?all=1">query</a>' "<a href=\"/r/$REPO_NAME\">root-relative</a>"; do
    grep -qF "$untouched" "$work/show.body" || bad="$bad rewrote '$untouched';"
  done
  image_status=$(fetch_page "/r/$REPO_NAME/asset/main/docs/arch.png" "$work/rel-image")
  link_status=$(fetch_page "/r/$REPO_NAME/blob/main/docs/BRAND.md" "$work/rel-link")
  [ "$image_status" = "200" ] || bad="$bad the rewritten image answered $image_status;"
  [ "$link_status" = "200" ] || bad="$bad the rewritten link answered $link_status;"
  if [ -n "$bad" ]; then
    rel_verdict=FAIL
    rel_detail="$bad"
  fi
fi

# 26
# read the collation back rather than assuming the migration took, and
# order two names whose relative position the collation decides
coll_verdict=""
coll_detail=""
if [ "$scratch_ok" = 1 ]; then
  collation=$(psql_scratch -c "
    select c.collname
      from pg_attribute a
      join pg_class t on t.oid = a.attrelid
      join pg_collation c on c.oid = a.attcollation
     where t.relname = 'repos' and a.attname = 'name'" 2>&1 | tr -d ' ')
  [ "$collation" = "C" ] || coll_detail="$coll_detail repos.name collates '$collation', not C;"
  if [ "$daemon_ok" = 1 ]; then
    psql_scratch -c "
      insert into repos (id, owner_id, name, created_at)
      select gen_random_uuid(), id, n, now() from users, (values ('abc'), ('ab-c')) as v(n)
      limit 2" > /dev/null 2>&1
    fetch_page "/" "$work/26" > /dev/null
    order=$(grep -oE '/r/(abc|ab-c)"' "$work/26.body" | sed 's|/r/||;s/"$//' | head -2 | tr '\n' ' ')
    psql_scratch -c "delete from repos where name in ('abc', 'ab-c')" > /dev/null 2>&1
    [ "$order" = "ab-c abc " ] \
      || coll_detail="$coll_detail the index ordered '$order', wanted 'ab-c abc ';"
  else
    coll_detail="$coll_detail the daemon never ran, so the ordering was not read off a page;"
  fi
fi
grep -qF 'keyset cursor on lower(name)' src/repos/list.ts \
  || coll_detail="$coll_detail src/repos/list.ts no longer names a keyset cursor on lower(name);"
# spelled as a pattern, and the control assembled from parts, so this
# script is not itself the hit it is looking for
counted_walk='rev-list[[:space:]]+--count'
printf '%s --%s\n' rev-list count > "$work/26.control"
if ! grep -qE "$counted_walk" "$work/26.control"; then
  coll_detail="$coll_detail the counted-walk pattern does not match a known hit; it cannot gate;"
else
  stale=$(git grep --untracked -nE "$counted_walk" -- src test scripts)
  [ -z "$stale" ] || coll_detail="$coll_detail a counted rev-list walk survives at: $stale;"
fi
[ -n "$coll_detail" ] && coll_verdict=FAIL

# 27
readonly TITLE_27="raw SQL sits at exactly three sites, each naming what it rejects"
# spelled around the tag name, so this script is not itself a hit, with a
# control that proves the pattern still finds one
raw_tag='\$(query|execute)Raw'
printf 'db.%s%s`SELECT 1`\ndb.%s%s`TRUNCATE x`\n' '$' queryRaw '$' executeRaw \
  > "$work/27.control"
wrong=""
if [ "$(grep -cE "$raw_tag" "$work/27.control")" != "2" ]; then
  wrong="$wrong the raw-tag pattern does not match a known call; it cannot gate;"
fi
git grep --untracked -nE "$raw_tag" -- src test scripts \
  ':!src/generated' > "$work/27.all" 2>/dev/null
# a test that swaps the tag for a stub is not a call site, and the
# assignment is what tells the two apart
grep -vE "$raw_tag[[:space:]]*=" "$work/27.all" > "$work/27.calls"
call_sites=$(cut -d: -f1 "$work/27.calls" | sort -u | tr '\n' ' ')
call_count=$(grep -c . "$work/27.calls")
[ "$call_count" = "3" ] || wrong="$wrong $call_count raw call site(s), wanted 3;"
[ "$call_sites" = "src/repos/list.ts src/repos/resolve.ts test/support/visual-db.ts " ] \
  || wrong="$wrong the sites are '$call_sites', not the three sanctioned ones;"
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  file=${hit%%:*}
  rest=${hit#*:}
  line=${rest%%:*}
  from=$((line - 5))
  [ "$from" -lt 1 ] && from=1
  sed -n "${from},${line}p" "$file" | grep -q '// raw:' \
    || wrong="$wrong $file:$line carries no // raw: comment naming the DSL construct it rejects;"
done < "$work/27.calls"
if [ -n "$wrong" ]; then
  record FAIL 27 "$TITLE_27" "$wrong"
else
  record PASS 27 "$TITLE_27" "3 sites, each with its own // raw: reason"
fi

# 28
readonly TITLE_28="mayWrite is tested against a fake store, owner case included"
never=$(grep -c 'deepStrictEqual(access.asked, \[\]' test/contract/access.contract.ts)
answers_false=$(sed -n '/the owner may write without the store being consulted/,/^});/p' \
  test/contract/access.contract.ts | grep -c 'store(false)')
if [ "$never" -lt 1 ]; then
  record FAIL 28 "$TITLE_28" "no test asserts the fake store recorded nothing"
elif [ "$answers_false" -lt 1 ]; then
  record FAIL 28 "$TITLE_28" "the owner case's fake answers true, so a consulted store would pass it anyway"
else
  contract 28 "$TITLE_28" 4 "the owner case asks a store that would say no, and never asks it" \
    access
fi

# 29
readonly TITLE_29="the tree route mirrors the blob route at every depth"
if require_daemon 29 "$TITLE_29" && require_seed 29 "$TITLE_29"; then
  : > "$spawn_log"
  capped_status=$(fetch_page "/r/$REPO_NAME/tree/main/$NESTED_DIR" "$work/tree-capped")
  listings=$(grep -c 'ls-tree' "$spawn_log")
  capped_rows=$(occurrences "$work/tree-capped.body" '<tr class="row')
  all_rows=$(occurrences "$work/tree.body" '<tr class="row')
  not_tree=$(fetch_page "/r/$REPO_NAME/tree/main/README.md" "$work/tree-blob")
  no_root=$(fetch_page "/r/$REPO_NAME/tree/main/" "$work/tree-root")
  bad_ref=$(fetch_page "/r/$REPO_NAME/tree/nope/$NESTED_DIR" "$work/tree-ref")
  wrong=""
  [ "$capped_status" = "200" ] || wrong="$wrong the nested tree answered $capped_status;"
  [ "$listings" = "1" ] || wrong="$wrong the listing cost $listings ls-tree call(s), wanted 1;"
  [ "$capped_rows" = "$ROW_CAP" ] || wrong="$wrong the nested tree drew $capped_rows rows, wanted $ROW_CAP;"
  [ "$all_rows" = "$NESTED_ROWS" ] || wrong="$wrong ?all=1 drew $all_rows rows, wanted $NESTED_ROWS;"
  grep -qF "Show all $NESTED_ROWS" "$work/tree-capped.body" \
    || wrong="$wrong the capped tree offers no show-all;"
  [ "$not_tree" = "404" ] || wrong="$wrong a blob path answered $not_tree, wanted 404;"
  [ "$no_root" = "404" ] || wrong="$wrong an empty tree path answered $no_root, wanted 404;"
  [ "$bad_ref" = "404" ] || wrong="$wrong an unknown ref answered $bad_ref, wanted 404;"
  for page in tree-blob tree-root tree-ref; do
    location=$(grep -i '^location:' "$work/$page.head" | tr -d '\r')
    [ -z "$location" ] || wrong="$wrong $page redirected: $location;"
  done
  if [ -n "$wrong" ]; then
    record FAIL 29 "$TITLE_29" "$wrong"
  else
    contract 29 "$TITLE_29" 4 "$capped_rows of $all_rows rows, one ls-tree, and three 404s that do not redirect" \
      tree-page -- \
      "a nested path lists its own entries, not the root's" \
      "the cap and the lift work at a nested depth too" \
      "a path that is not a tree is nothing, never a redirect" \
      "no page route redirects"
  fi
fi

# 30
readonly TITLE_30="rows link by kind, and the tree's wash and overlay are live"
if require_daemon 30 "$TITLE_30" && require_seed 30 "$TITLE_30"; then
  sub_status=$(fetch_page "/r/$REPO_NAME/tree/main/vendor" "$work/tree-sub")
  wrong=""
  grep -qF "<a class=\"t-item\" lang=\"en\" href=\"/r/$REPO_NAME/blob/main/README.md\">" \
    "$work/show.body" || wrong="$wrong a file row does not link to the blob route;"
  grep -qF "<a class=\"t-item\" lang=\"en\" href=\"/r/$REPO_NAME/tree/main/docs\">" \
    "$work/show.body" || wrong="$wrong a directory row does not link to the tree route;"
  [ "$sub_status" = "200" ] || wrong="$wrong the gitlink's own tree answered $sub_status;"
  grep -qF '<tr class="row is-sub">' "$work/tree-sub.body" \
    || wrong="$wrong the gitlink draws no is-sub row;"
  sub_row=$(tr '\n' ' ' < "$work/tree-sub.body" \
    | sed 's/.*<tr class="row is-sub">//' | sed 's|</tr>.*||')
  printf '%s' "$sub_row" | grep -qF '<a ' \
    && wrong="$wrong the gitlink row carries a link;"
  # the wash is on the row now, and the overlay is gone with the <li>:
  # each cell's own link is the hit area, so all three stay reachable
  grep -qE '^\.tbl tbody tr:hover,' src/html/styles.ts \
    || wrong="$wrong the sheet no longer washes a row on hover;"
  grep -qE '\.nm::after' src/html/styles.ts \
    && wrong="$wrong the row overlay is back, and it swallows two of the three links;"
  grep -qE '^\.tree \.is-sub:hover,' src/html/styles.ts \
    || wrong="$wrong the sheet no longer keeps the gitlink row out of the wash;"
  if [ -n "$wrong" ]; then
    record FAIL 30 "$TITLE_30" "$wrong"
  else
    contract 30 "$TITLE_30" 4 "file to blob, directory to tree, gitlink nowhere" \
      tree-page axe -- \
      "rows link by kind, and a gitlink links nowhere" \
      "a directory row links to the tree route, one level down" \
      "the tree row's link fills its cell and the wash is live" \
      "a gitlink row is inert"
  fi
fi

# 32
# revision round one, part A item 2: one heading treatment across the six
# routes that carry no mark. blob already carried .t-item, so it is in the
# sweep for completeness rather than because anything changed under it.
# round two adds --title as an optional second class on the list pages'
# titles (check 43 pins which pages carry it); the base face stays .t-item
readonly TITLE_32="every visible page title renders .t-item, never .t-l or a .t-label h1"
if require_daemon 32 "$TITLE_32" && require_seed 32 "$TITLE_32"; then
  wrong=""
  for page in blob-text tree log1 branches tags commit-big commit-one; do
    grep -qE '<h1 class="t-item( t-item--title)?"' "$work/$page.body" \
      || wrong="$wrong $page carries no visible .t-item heading;"
    grep -qE '<h1 class="t-l"|<h1 class="t-label"' "$work/$page.body" \
      && wrong="$wrong $page still carries a .t-l or .t-label h1;"
  done
  if [ -n "$wrong" ]; then
    record FAIL 32 "$TITLE_32" "$wrong"
  else
    record PASS 32 "$TITLE_32" "blob, tree, log, branches, tags and commit all agree"
  fi
fi

# 33
# PLAN 00's rule reaches every index view, refs included: the <li> shape
# 1e shipped first was the one that did not match the record
readonly TITLE_33="ref-list.ts emits a captioned table, and no <li> row"
markup_only=$(grep -vE '^\s*//' src/html/ref-list.ts)
wrong=""
printf '%s' "$markup_only" | grep -qF '<table class="tbl refs">' \
  || wrong="$wrong ref-list.ts emits no table;"
printf '%s' "$markup_only" | grep -qF '<caption class="vh">' \
  || wrong="$wrong ref-list.ts emits no caption;"
printf '%s' "$markup_only" | grep -qF '<th class="nm" scope="row">' \
  || wrong="$wrong a ref row's first cell is not its header;"
printf '%s' "$markup_only" | grep -qE '<li|role="list"' \
  && wrong="$wrong ref-list.ts still emits list markup;"
if [ -n "$wrong" ]; then
  record FAIL 33 "$TITLE_33" "$wrong"
else
  record PASS 33 "$TITLE_33" "branches and tags are captioned tables with row headers"
fi

# 34
readonly TITLE_34="--diff-add and --diff-del are in both palettes, and resolve differently"
wrong=""
[ "$(grep -c -- '--diff-add:' src/html/styles.ts)" = "2" ] \
  || wrong="$wrong --diff-add is not declared exactly twice;"
[ "$(grep -c -- '--diff-del:' src/html/styles.ts)" = "2" ] \
  || wrong="$wrong --diff-del is not declared exactly twice;"
grep -A1 '^\.diff \.a {' src/html/styles.ts | grep -qF 'var(--diff-add)' \
  || wrong="$wrong .diff .a does not draw from --diff-add;"
grep -A1 '^\.diff \.d {' src/html/styles.ts | grep -qF 'var(--diff-del)' \
  || wrong="$wrong .diff .d does not draw from --diff-del;"
dark_add=$(sed -nE 's/.*--diff-add: (#[0-9a-f]{6});.*/\1/p' src/html/styles.ts | sed -n 1p)
dark_del=$(sed -nE 's/.*--diff-del: (#[0-9a-f]{6});.*/\1/p' src/html/styles.ts | sed -n 1p)
light_add=$(sed -nE 's/.*--diff-add: (#[0-9a-f]{6});.*/\1/p' src/html/styles.ts | sed -n 2p)
light_del=$(sed -nE 's/.*--diff-del: (#[0-9a-f]{6});.*/\1/p' src/html/styles.ts | sed -n 2p)
[ -n "$dark_add" ] && [ -n "$dark_del" ] && [ -n "$light_add" ] && [ -n "$light_del" ] \
  || wrong="$wrong a diff token did not resolve to a hex color;"
[ "$dark_add" != "$dark_del" ] || wrong="$wrong dark --diff-add and --diff-del are the same color;"
[ "$light_add" != "$light_del" ] || wrong="$wrong light --diff-add and --diff-del are the same color;"
if [ -n "$wrong" ]; then
  record FAIL 34 "$TITLE_34" "$wrong"
else
  record PASS 34 "$TITLE_34" "dark $dark_add/$dark_del, light $light_add/$light_del"
fi

# 35
# tokens.contract.ts already asserts this verbatim; this check exists so a
# drift between the two files names itself here too, not only in the suite
readonly TITLE_35="docs/BRAND.md's token fence and styles.ts's tokens are byte-identical"
if [ "$build_ok" != 1 ]; then
  record FAIL 35 "$TITLE_35" "the build did not produce dist, see check 1"
else
  fence_check=$(node --input-type=module -e '
    import { readFileSync } from "node:fs";
    import { tokens } from "./dist/src/html/styles.js";

    const brand = readFileSync("docs/BRAND.md", "utf8");
    const match = /```css\n([\s\S]*?)\n```/.exec(brand);
    if (!match) { console.log("NO_FENCE"); process.exit(0); }
    console.log(match[1] === tokens ? "MATCH" : "DRIFT");
  ' 2>&1)
  if [ "$fence_check" = "MATCH" ]; then
    record PASS 35 "$TITLE_35"
  else
    record FAIL 35 "$TITLE_35" "docs-artifact comparison reported: $fence_check"
  fi
fi

# 36
# the not-found handler is a route match too, so it owes the same onSend
# headers as every other page; the git http transport's own 404s are
# matched routes and never reach it, so a real one has to be fetched to
# prove the handler did not swallow it
readonly TITLE_36="an unmatched URL is the html error page, and the git transport is untouched"
if require_daemon 36 "$TITLE_36"; then
  miss_status=$(fetch_page "/this/matches/nothing" "$work/36miss")
  miss_type=$(grep -i '^content-type:' "$work/36miss.head" | tr -d '\r')
  miss_csp=$(grep -ic '^content-security-policy:' "$work/36miss.head")
  git_status=$(fetch_page "/r/$ABSENT_NAME/info/refs?service=git-upload-pack" "$work/36git")
  git_type=$(grep -i '^content-type:' "$work/36git.head" | tr -d '\r')
  wrong=""
  [ "$miss_status" = "404" ] || wrong="$wrong the unmatched url answered $miss_status;"
  printf '%s' "$miss_type" | grep -qi 'text/html' \
    || wrong="$wrong the unmatched url answered '$miss_type', not text/html;"
  grep -qF '<h1 class="t-l">Nothing here</h1>' "$work/36miss.body" \
    || wrong="$wrong the 404 page carries no Nothing here heading;"
  grep -qF '{"message"' "$work/36miss.body" \
    && wrong="$wrong the unmatched url still answers as fastify's default json 404;"
  [ "$miss_csp" -ge 1 ] || wrong="$wrong the 404 page carries no Content-Security-Policy header;"
  [ "$git_status" = "404" ] || wrong="$wrong the git transport's own 404 answered $git_status;"
  printf '%s' "$git_type" | grep -qi 'text/plain' \
    || wrong="$wrong the git transport's 404 answered '$git_type', not text/plain;"
  grep -qF "There's no repo named $ABSENT_NAME. Push to it over SSH to create it." \
    "$work/36git.body" || wrong="$wrong the git transport's refusal copy changed;"
  if [ -n "$wrong" ]; then
    record FAIL 36 "$TITLE_36" "$wrong"
  else
    record PASS 36 "$TITLE_36" "html 404 with security headers; git transport still text/plain"
  fi
fi

# 37
readonly TITLE_37="/r/:repo links to all three of commits, branches and tags"
if require_daemon 37 "$TITLE_37" && require_seed 37 "$TITLE_37"; then
  wrong=""
  grep -qF "<nav class=\"repo-nav\" aria-label=\"Repo views\">" "$work/show.body" \
    || wrong="$wrong the repo page carries no repo nav;"
  grep -qF "href=\"/r/$REPO_NAME/commits?ref=main\"" "$work/show.body" \
    || wrong="$wrong the repo page does not link to the commit log;"
  grep -qF "href=\"/r/$REPO_NAME/branches\"" "$work/show.body" \
    || wrong="$wrong the repo page does not link to branches;"
  grep -qF "href=\"/r/$REPO_NAME/tags\"" "$work/show.body" \
    || wrong="$wrong the repo page does not link to tags;"
  if [ -n "$wrong" ]; then
    record FAIL 37 "$TITLE_37" "$wrong"
  else
    record PASS 37 "$TITLE_37" "commits, branches and tags all reachable from the repo page"
  fi
fi

# 38
# 22 seeded commits over a 16-row page cap makes exactly two pages, so page
# two is also the last one: Newer pops straight back to the bare ref
readonly TITLE_38="page two of the log carries a Newer link, and page one does not"
if require_daemon 38 "$TITLE_38" && require_seed 38 "$TITLE_38"; then
  wrong=""
  grep -qF 'Newer' "$work/log1.body" && wrong="$wrong page one offers a way back;"
  grep -qF "href=\"/r/$REPO_NAME/commits?ref=main\"><span aria-hidden=\"true\">← </span>Newer" \
    "$work/log2.body" || wrong="$wrong page two's Newer link does not land on the bare ref;"
  if [ -n "$wrong" ]; then
    record FAIL 38 "$TITLE_38" "$wrong"
  else
    record PASS 38 "$TITLE_38" "page one has no Newer, page two's Newer reaches page one"
  fi
fi

# 39
# the seed carries one lightweight tag (v1.0.0) and one annotated tag
# (v1.1.0), planted by check 2's build_seed for exactly this
readonly TITLE_39="an annotated tag row carries the marker, a lightweight one does not"
if require_daemon 39 "$TITLE_39" && require_seed 39 "$TITLE_39"; then
  wrong=""
  grep -qF '<span class="caps">v1.1.0</span><span class="t-micro"> Annotated</span>' "$work/tags.body" \
    || wrong="$wrong the annotated tag v1.1.0 carries no marker;"
  grep -qF '<span class="caps">v1.0.0</span><span class="t-micro"> Annotated</span>' "$work/tags.body" \
    && wrong="$wrong the lightweight tag v1.0.0 carries the annotated marker;"
  if [ -n "$wrong" ]; then
    record FAIL 39 "$TITLE_39" "$wrong"
  else
    record PASS 39 "$TITLE_39" "v1.1.0 marked, v1.0.0 not"
  fi
fi

# 40
# part A item 5, and part B item 7's row markers on a commit that both
# inlines diffs and links the rest, which check 7 already proved happens
readonly TITLE_40=".meta stacks to one column outside any media query, and diff rows say where"
wrong=""
tr '\n' ' ' < src/html/styles.ts \
  | grep -qE '\.meta \{[[:space:]]+display: grid;[[:space:]]+grid-template-columns: 1fr;' \
  || wrong="$wrong .meta's bare rule is not a single 1fr column;"
if require_daemon 40 "$TITLE_40" && require_seed 40 "$TITLE_40"; then
  grep -qF '<span class="t-micro">Below<span class="vh"> on this page</span></span>' \
    "$work/commit-big.body" || wrong="$wrong no inlined row on the root commit says Below;"
  grep -qF '<span class="t-micro">Own page</span>' "$work/commit-big.body" \
    || wrong="$wrong no linked row on the root commit says Own page;"
fi
if [ -n "$wrong" ]; then
  record FAIL 40 "$TITLE_40" "$wrong"
else
  record PASS 40 "$TITLE_40" ".meta is 1fr outside the query; Below and Own page both render"
fi

# 41
# part A1 converged the three-column Row onto one rule; the table keeps
# that, as column widths on one .tbl rather than a track list per view.
# the two-column file list is the one documented divergence
readonly TITLE_41="one .tbl rule widths every three-column table, and only .files overrides"
wrong=""
sheet_flat=$(tr '\n' ' ' < src/html/styles.ts)
printf '%s' "$sheet_flat" | grep -qE '\.tbl \.nm \{[[:space:]]*width: 40%;' \
  || wrong="$wrong .tbl's shared name column width is missing;"
printf '%s' "$sheet_flat" | grep -qE '\.tbl \.age \{[[:space:]]*width: 46px;' \
  || wrong="$wrong .tbl's shared age column width is missing;"
overrides=$(grep -cE '^\.(repos|tree|log|refs) \.(nm|msg|age) \{' src/html/styles.ts)
[ "$overrides" = "0" ] \
  || wrong="$wrong $overrides per-view column override(s) reintroduce a second rule;"
grep -qE '^\.files \.nm \{' src/html/styles.ts \
  || wrong="$wrong the two-column file list no longer takes the remainder;"
if [ -n "$wrong" ]; then
  record FAIL 41 "$TITLE_41" "$wrong"
else
  record PASS 41 "$TITLE_41" "one .tbl width rule, no per-view override, .files the documented divergence"
fi

# 42
# part A2: the name column of a Row takes small caps, branches, tags and the
# repo index included. a ref and a repo name have no extension to find, so
# those two call plainName() and the tree calls pathName()
readonly TITLE_42="ref-list.ts and repo-list.ts call plainName(), and neither list splits a name"
wrong=""
grep -qF "plainName(" src/html/ref-list.ts \
  || wrong="$wrong ref-list.ts never calls plainName();"
grep -qF "plainName(" src/html/repo-list.ts \
  || wrong="$wrong repo-list.ts never calls plainName();"
grep -qF "pathName(" src/html/tree-list.ts \
  || wrong="$wrong tree-list.ts never calls pathName();"
if require_daemon 42 "$TITLE_42" && require_seed 42 "$TITLE_42"; then
  for page in branches tags index; do
    grep -qF '<span class="caps">' "$work/$page.body" \
      || wrong="$wrong the rendered $page carries no small-caps wrapper;"
    grep -qF 'class="sc"' "$work/$page.body" \
      && wrong="$wrong $page split a name that has no extension;"
  done
  grep -qF 'class="sc"' "$work/tree.body" \
    || wrong="$wrong the tree listing stopped splitting filenames at their extension;"
fi
if [ -n "$wrong" ]; then
  record FAIL 42 "$TITLE_42" "$wrong"
else
  record PASS 42 "$TITLE_42" "refs and the index render whole names, the tree still splits its filenames"
fi

# 43
# part B: the title takes --ink-soft via a modifier class; the rows under
# it keep the bare .t-item, so the marker appears exactly once per page
readonly TITLE_43="every visible page title resolves to --ink-soft, and its rows stay --ink"
wrong=""
tr '\n' ' ' < src/html/styles.ts \
  | grep -qE '\.t-item--title \{[[:space:]]+color: var\(--ink-soft\);' \
  || wrong="$wrong .t-item--title does not resolve to --ink-soft;"
if require_daemon 43 "$TITLE_43" && require_seed 43 "$TITLE_43"; then
  for page in index tree branches tags; do
    body="$work/$page.body"
    [ -f "$body" ] || continue
    count=$(occurrences "$body" 't-item--title')
    [ "$count" = "1" ] \
      || wrong="$wrong $page.body carries the title modifier $count times, wanted exactly 1;"
  done
fi
if [ -n "$wrong" ]; then
  record FAIL 43 "$TITLE_43" "$wrong"
else
  record PASS 43 "$TITLE_43" "the modifier resolves to --ink-soft and marks exactly one heading per page"
fi

# 44
# part C4: a sentence takes .t-note; .t-label is left holding only captions
readonly TITLE_44=".t-label appears in no template carrying more than two words"
wrong=""
label_sites=$(grep -rl 'class="t-label"' src/html/*.ts | wc -l | tr -d ' ')
[ "$label_sites" = "1" ] \
  || wrong="$wrong .t-label appears in $label_sites template files, wanted exactly 1 (repo-show.ts's Files caption);"
grep -qF 'class="t-label"' src/html/repo-show.ts \
  || wrong="$wrong repo-show.ts no longer carries the one surviving .t-label use;"
if [ -n "$wrong" ]; then
  record FAIL 44 "$TITLE_44" "$wrong"
else
  record PASS 44 "$TITLE_44" "repo-show.ts's Files caption is the one .t-label site left"
fi

# 45
# part C1: the repo nav takes the same link treatment every other link in
# the product carries, rather than a muted mono color with no decoration
readonly TITLE_45="the repo nav entries resolve to the link colour"
wrong=""
tr '\n' ' ' < src/html/styles.ts \
  | grep -qE '\.repo-nav a \{[^}]*color: var\(--accent-text\);[^}]*text-decoration: underline;' \
  || wrong="$wrong .repo-nav a does not resolve to --accent-text, underlined;"
grep -A8 -E '^\.repo-nav a \{' src/html/styles.ts | grep -q -- '--ink-mid' \
  && wrong="$wrong .repo-nav a still carries the old muted color;"
if [ -n "$wrong" ]; then
  record FAIL 45 "$TITLE_45" "$wrong"
else
  record PASS 45 "$TITLE_45" ".repo-nav a resolves to --accent-text, underlined, like every other link"
fi

# 46
# part C2: a gitlink row carries a state marker, the way Default and
# Annotated already mark the branch and tag lists
readonly TITLE_46="a gitlink row carries a .t-micro marker"
wrong=""
if require_daemon 46 "$TITLE_46" && require_seed 46 "$TITLE_46"; then
  grep -qF '<span class="t-micro"> Pinned</span>' "$work/tree-sub.body" \
    || wrong="$wrong the gitlink row carries no .t-micro marker;"
fi
if [ -n "$wrong" ]; then
  record FAIL 46 "$TITLE_46" "$wrong"
else
  record PASS 46 "$TITLE_46" "the gitlink row is marked Pinned"
fi

# 47
# part C3: the hunk header reads as structure, not as the parent-commit
# link's own pink
readonly TITLE_47=".diff .h does not resolve to --accent-text"
wrong=""
tr '\n' ' ' < src/html/styles.ts \
  | grep -qE '\.diff \.h \{[[:space:]]+color: var\(--ink-soft\);[[:space:]]+font-weight: 500;' \
  || wrong="$wrong .diff .h is not --ink-soft at weight 500;"
if [ -n "$wrong" ]; then
  record FAIL 47 "$TITLE_47" "$wrong"
else
  record PASS 47 "$TITLE_47" ".diff .h resolves to --ink-soft, weight 500"
fi

# 48
# every decision this revision made has to be readable in BRAND.md, or the
# next reviser rediscovers it from the CSS instead of the reasoning
readonly TITLE_48="BRAND documents the nav, the widened small caps rule, both mono deviations, and the note class"
wrong=""
grep -qF "### Repo nav" docs/BRAND.md \
  || wrong="$wrong BRAND carries no Repo nav section;"
grep -qF "link treatment every other link in the product carries" docs/BRAND.md \
  || wrong="$wrong BRAND does not record the nav's link treatment;"
grep -qF "The rule is the name column, not the filename." docs/BRAND.md \
  || wrong="$wrong BRAND still scopes small caps to filenames alone;"
grep -qF "A SHA is a machine identifier" docs/BRAND.md \
  || wrong="$wrong BRAND does not record the commit log's mono deviation;"
grep -qF "would fight the diff blocks directly under it" docs/BRAND.md \
  || wrong="$wrong BRAND does not record the file list's mono deviation;"
grep -qF ".t-note" docs/BRAND.md \
  || wrong="$wrong BRAND does not document .t-note;"
if [ -n "$wrong" ]; then
  record FAIL 48 "$TITLE_48" "$wrong"
else
  record PASS 48 "$TITLE_48" "nav, small caps, both deviations, and .t-note are all on the record"
fi

# 49
# part D3: a uniform 3-hour step read every commit at the same age bucket;
# the fixture now spreads them, so the column has a range to show
readonly TITLE_49="the fixture's commit dates span more than one age unit"
if [ -f dist/test/support/fixture-repos.js ]; then
  units=$(node --input-type=module -e '
    import { fixtureRepos } from "./dist/test/support/fixture-repos.js";
    const gantry = fixtureRepos.find((r) => r.name === "gantry");
    const frozen = Date.parse("2026-02-01T12:00:00.000Z");
    const bucket = (at) => {
      const seconds = (frozen - Date.parse(at)) / 1000;
      if (seconds < 60) return "now";
      if (seconds < 3600) return "m";
      if (seconds < 86400) return "h";
      if (seconds < 604800) return "d";
      if (seconds < 31536000) return "w";
      return "y";
    };
    const seen = new Set(gantry.commits.map((c) => bucket(c.at)));
    process.stdout.write([...seen].sort().join(","));
  ' 2>/dev/null)
  unit_count=$(printf '%s' "$units" | tr ',' '\n' | grep -c . || true)
  if [ "$unit_count" -ge 3 ]; then
    record PASS 49 "$TITLE_49" "the fixture's commits land in $unit_count age buckets: $units"
  else
    record FAIL 49 "$TITLE_49" "the fixture's commits land in only $unit_count age bucket(s): $units"
  fi
else
  record FAIL 49 "$TITLE_49" "dist/test/support/fixture-repos.js is missing, see check 1"
fi

# 50
# round 2 follow-up: the blob truncation notice reads after the file stops,
# not before it starts, and sits next to the Show entire file hatch
readonly TITLE_50="the blob truncation notice sits below the code block, beside the raw hatch"
wrong=""
if [ -f "$work/blob-cut.body" ]; then
  pre_pos=$(grep -bo '</pre>' "$work/blob-cut.body" | head -1 | cut -d: -f1)
  note_pos=$(grep -bo 'id="blob-cut"' "$work/blob-cut.body" | head -1 | cut -d: -f1)
  if [ -z "$pre_pos" ] || [ -z "$note_pos" ]; then
    wrong="$wrong could not find both </pre> and the blob-cut notice;"
  elif [ "$note_pos" -lt "$pre_pos" ]; then
    wrong="$wrong the notice still sits above </pre>, not below it;"
  fi
else
  wrong="$wrong \$work/blob-cut.body is missing, see check 3;"
fi
if [ -n "$wrong" ]; then
  record FAIL 50 "$TITLE_50" "$wrong"
else
  record PASS 50 "$TITLE_50" "the notice follows </pre>, reading order matches where the file stops"
fi

# 51
# the split is positional, so an .sc span always opens at the dot it split
# on. one that opens on anything else is either empty or a name with no
# extension that took the treatment anyway
readonly TITLE_51="every rendered .sc span opens at a dot, and none is empty"
wrong=""
opened=0
if require_daemon 51 "$TITLE_51" && require_seed 51 "$TITLE_51"; then
  opened=$(grep -ohF '<span class="sc">.' "$work"/*.body 2>/dev/null | grep -c .)
  stray=$(grep -ohE '<span class="sc">.' "$work"/*.body 2>/dev/null | grep -cv '\.$')
  [ "$stray" = "0" ] || wrong="$wrong $stray .sc span(s) do not open at a dot;"
  grep -qF '<span class="sc"></span>' "$work"/*.body 2>/dev/null \
    && wrong="$wrong a body renders an empty .sc span;"
  [ "$opened" != "0" ] \
    || wrong="$wrong no body carries an .sc span at all, so nothing was measured;"
fi
if [ -n "$wrong" ]; then
  record FAIL 51 "$TITLE_51" "$wrong"
else
  record PASS 51 "$TITLE_51" "$opened .sc span(s) rendered, every one opening at its dot"
fi

# 52
# PLAN 00's rule, read off the wire: every index view is a table, and none
# is still a Row list. the class pairs a table to the view it belongs to,
# so a view rendering the wrong one is caught rather than merely counted
readonly TITLE_52="every list view serves a table, and none serves a <ul> list"
wrong=""
tables=0
if require_daemon 52 "$TITLE_52" && require_seed 52 "$TITLE_52"; then
  for pair in index:repos show:tree tree:tree log1:log branches:refs \
    tags:refs commit-big:files commit-one:files; do
    page=${pair%%:*}
    kind=${pair##*:}
    [ -s "$work/$page.body" ] || { wrong="$wrong /$page was never fetched;"; continue; }
    if grep -qF "<table class=\"tbl $kind\">" "$work/$page.body"; then
      tables=$((tables + 1))
    else
      wrong="$wrong /$page serves no .tbl.$kind table;"
    fi
    grep -qE '<ul class="(repos|tree|log|refs|files)"' "$work/$page.body" \
      && wrong="$wrong /$page still serves a Row list;"
    grep -qE '<li class="row' "$work/$page.body" \
      && wrong="$wrong /$page still serves <li> rows;"
  done
  [ "$tables" != "0" ] \
    || wrong="$wrong no page served a table at all, so nothing was measured;"
fi
if [ -n "$wrong" ]; then
  record FAIL 52 "$TITLE_52" "$wrong"
else
  record PASS 52 "$TITLE_52" "$tables served tables, no <ul> list and no <li> row left"
fi

# 53
# a display value on a table element is what costs the native semantics,
# and the ban is only worth having if the detector can catch one: a planted
# override is run through the same reader before the real sheet is judged
readonly TITLE_53="no table element carries a display override, and a planted one is caught"
wrong=""
verdict=""
if [ -n "${sheet_href:-}" ] && [ -s "$work/sheet.body" ]; then
  cat > "$work/planted.css" <<'PLANTED'
.tbl tbody td { display: grid; }
PLANTED
  read_display() {
    node --input-type=module -e '
      import { readFileSync } from "node:fs";
      const css = readFileSync(process.argv[1], "utf8");
      const table = /^(table|thead|tbody|tfoot|tr|th|td|caption)\b/;
      const hits = [];
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/display\s*:/.test(body)) continue;
        for (const one of selector.split(",")) {
          const last = one.trim().split(/[\s>+~]+/).pop() ?? "";
          if (table.test(last)) hits.push(one.trim());
        }
      }
      process.stdout.write(hits.join(" ") || "none");
    ' "$1" 2>/dev/null
  }
  planted=$(read_display "$work/planted.css")
  served=$(read_display "$work/sheet.body")
  [ "$planted" = "none" ] \
    && wrong="$wrong the reader missed a planted display override, so a clean sheet proves nothing;"
  [ "$served" = "none" ] \
    || wrong="$wrong the served sheet sets display on: $served;"
  verdict="planted caught as '$planted', served sheet clean"
else
  wrong="$wrong no served stylesheet was read, see check 2;"
fi
if [ -n "$wrong" ]; then
  record FAIL 53 "$TITLE_53" "$wrong"
else
  record PASS 53 "$TITLE_53" "$verdict"
fi

# 54
# the caption and the header row are what a reader gets with the CSS off,
# which is the whole reason PLAN 00 asks for a table. counted per table so
# a view that grows a second one cannot ride on the first one's caption
readonly TITLE_54="every served table carries a caption, a header row, and row headers"
wrong=""
counted=0
if require_daemon 54 "$TITLE_54" && require_seed 54 "$TITLE_54"; then
  for page in index show tree log1 branches tags commit-big commit-one; do
    [ -s "$work/$page.body" ] || continue
    opened=$(occurrences "$work/$page.body" '<table class="tbl')
    [ "$opened" -gt 0 ] || continue
    counted=$((counted + opened))
    caps=$(occurrences "$work/$page.body" '<caption class="vh">')
    # a rendered README carries its own <thead>, so the header row is
    # counted by the name column's own marker rather than by the tag
    heads=$(occurrences "$work/$page.body" '<th class="nm t-label" scope="col">')
    [ "$caps" = "$opened" ] \
      || wrong="$wrong /$page has $opened table(s) and $caps caption(s);"
    [ "$heads" = "$opened" ] \
      || wrong="$wrong /$page has $opened table(s) and $heads header row(s);"
    rows=$(occurrences "$work/$page.body" '<tr class="row')
    headers=$(occurrences "$work/$page.body" '<th class="nm" scope="row">')
    [ "$rows" = "$headers" ] \
      || wrong="$wrong /$page draws $rows row(s) but $headers row header(s);"
    grep -qE '<th class="[a-z]+ t-label" scope="col">' "$work/$page.body" \
      || wrong="$wrong /$page names no column in its header row;"
  done
  [ "$counted" != "0" ] \
    || wrong="$wrong no served table was found, so nothing was measured;"
fi
if [ -n "$wrong" ]; then
  record FAIL 54 "$TITLE_54" "$wrong"
else
  record PASS 54 "$TITLE_54" "$counted served table(s), each captioned and headed, every row led by its own header"
fi

# 55
# the columns are widths on a fixed layout, not grid tracks. auto cannot
# size a column under its min-content, so a name that does not wrap makes
# the table wider than the viewport instead of ellipsing
readonly TITLE_55="the row table lays out fixed, and the old row grid is gone"
wrong=""
if [ -s "$work/sheet.body" ]; then
  grep -qF 'table-layout:fixed' "$work/sheet.body" \
    || grep -qF 'table-layout: fixed' "$work/sheet.body" \
    || wrong="$wrong the served sheet does not lay the row table out fixed;"
  grep -qE 'grid-template-columns:[^;}]*46px' "$work/sheet.body" \
    && wrong="$wrong the served sheet still carries the row grid's track list;"
else
  wrong="$wrong no served stylesheet was read, see check 2;"
fi
grep -qE '\.row\s*\{[^}]*display:\s*grid' src/html/styles.ts \
  && wrong="$wrong styles.ts still lays a row out as a grid;"
if [ -n "$wrong" ]; then
  record FAIL 55 "$TITLE_55" "$wrong"
else
  record PASS 55 "$TITLE_55" "table-layout: fixed served, and no 46px grid track survives"
fi

# 56
# the 1.4.12 gate is computed geometry at 320px, which no screenshot shows
# and no other gate reaches: axe's avoid-inline-spacing looks for style
# attributes fighting a user sheet, and this stylesheet sets none
contract 56 "the four 1.4.12 spacing overrides cost the table nothing at 320px" 6 \
  "columns hold, no row is lost, and every target stays 24px" \
  text-spacing -- \
  "the spacing overrides actually reach the table" \
  "no list view reflows into horizontal scroll at 320px" \
  "the spacing overrides move no column boundary" \
  "the spacing overrides drop no row and shrink none" \
  "every cell's link holds 24x24 under the spacing overrides" \
  "a name the spacing overrides ellipse is still whole in the DOM"

# 25, printed in its place
readonly TITLE_25="relative links and images rewrite, and everything else is left alone"
if [ "$seed_ok" != 1 ]; then
  record FAIL 25 "$TITLE_25" "the repo was never seeded over SSH, see check 2"
elif [ "$rel_verdict" = FAIL ]; then
  record FAIL 25 "$TITLE_25" "$rel_detail"
else
  contract 25 "$TITLE_25" 4 "both rewrites resolve to 200, and four other destinations are untouched" \
    markdown -- \
    "a relative link reaches the blob route and a relative image the asset route" \
    "a destination that resolves to nothing is still rewritten" \
    "an absolute destination is left exactly as it was" \
    "an anchor, a query, or a root-relative path is not treated as a path"
fi

# 26, printed in its place
readonly TITLE_26="repos.name collates C, and the sort it decides is read off a page"
if [ "$scratch_ok" != 1 ]; then
  record FAIL 26 "$TITLE_26" "no scratch database: ${scratch_why:-cause unrecorded}"
elif [ "$coll_verdict" = FAIL ]; then
  record FAIL 26 "$TITLE_26" "$coll_detail"
else
  record PASS 26 "$TITLE_26" "pg_collation says C, and ab-c listed before abc"
fi

stop_daemons

# torn down here, not at check 31: verify-phase-1b.sh's own check 23 counts
# every carn_verify_% database, and would read this run's as a stray
drop_scratch
rm -rf "$repo_root"

# 24
# after the daemons are down and the scratch database is dropped: 1a's
# check 9 needs port 3000, and 1b's check 23 reads a live scratch as a stray
readonly TITLE_24="the 1a, 1b, 1c and 1d verify scripts all still pass in full"
if require_db 24 "$TITLE_24"; then
  failed=""
  for phase in 1a 1b 1c 1d; do
    "./scripts/verify-phase-$phase.sh" > "$work/24.$phase" 2>&1 \
      || failed="$failed $phase: $(grep '^FAIL' "$work/24.$phase" | head -3 | tr '\n' ' ')"
  done
  if [ -n "$failed" ]; then
    record FAIL 24 "$TITLE_24" "$failed"
  else
    record PASS 24 "$TITLE_24" \
      "$(tail -1 "$work/24.1a"), $(tail -1 "$work/24.1b"), $(tail -1 "$work/24.1c"), $(tail -1 "$work/24.1d")"
  fi
fi

# 31
# the run is idempotent by construction: a scratch database named for this
# pid, a mktemp repo root, ephemeral ports, and one trap. what a second run
# would inherit is exactly what this check refuses to find
readonly TITLE_31="the run leaves no scratch database, rows, or repos behind"
if require_db 31 "$TITLE_31"; then
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
    record PASS 31 "$TITLE_31" "development database still $dev_rows repos:ssh_keys"
  else
    record FAIL 31 "$TITLE_31" "$left"
  fi
fi

ran=$(grep -c . "$log")
fails=$(grep -c '^FAIL ' "$log")

echo
if [ "$fails" -eq 0 ] && [ "$ran" -eq "$EXPECTED_CHECKS" ]; then
  echo "Phase 1e: $ran of $EXPECTED_CHECKS checks passed."
  exit 0
fi
echo "Phase 1e: $fails failing, $ran of $EXPECTED_CHECKS checks ran."
exit 1

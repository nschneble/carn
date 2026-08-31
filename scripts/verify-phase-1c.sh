#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Phase 1c exit checks, from docs/phases/1c-http.md.
# Prints PASS or FAIL for each of the 20 checks and exits non-zero if any
# fail. Reads DATABASE_URL from the environment, falling back to ./.env.
# State lands in three places; the EXIT trap tears down all three.

# not set -e: this runs commands expected to fail and reads their status
set -uo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

readonly EXPECTED_CHECKS=20
readonly REPO_NAME=verify1c
readonly ABSENT_NAME=absent1c
readonly DEFAULT_ROOT=./local/repos
readonly SSH_FLAGS="-o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=5"
readonly UPLOAD_TYPE="application/x-git-upload-pack-request"
readonly SERVICE_HEADER='001e# service=git-upload-pack'
readonly NO_HTTP_PUSH="This server takes pushes over SSH, not HTTP."
readonly NO_REPO="There's no repo named $ABSENT_NAME. Push to it over SSH to create it."
readonly BAD_NAME="That's not a valid repo name. Check the URL and try again."
readonly MIGRATIONS="20260824223229_init 20260824223246_seed_admin"

work=$(mktemp -d) || work=""
if [ -z "$work" ]; then
  echo "verify-phase-1c: gave no temp directory" >&2
  exit 1
fi
readonly work
readonly log="$work/results"
readonly repo_root="$work/repos"
readonly host_key="$work/ssh_host_ed25519_key"
readonly seed="$work/seed"
: > "$log"

# a hermetic client: the developer's protocol.version or insteadOf would
# otherwise decide what checks 3 and 4 actually send
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_GLOBAL="$work/gitconfig"
printf '[user]\n\tname = Carn Verify\n\temail = verify@carn.invalid\n[commit]\n\tgpgsign = false\n' \
  > "$GIT_CONFIG_GLOBAL"

daemon_pid=""
ssh_port=""
http_port=""

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
  bounded 60 "$@"
}

url_for() {
  printf 'ssh://git@127.0.0.1:%s/%s' "$ssh_port" "$1"
}

http_url() {
  printf 'http://127.0.0.1:%s/r/%s' "$http_port" "$1"
}

refs_url() {
  printf 'http://127.0.0.1:%s/r/%s/info/refs?service=%s' "$http_port" "$1" "$2"
}

free_port() {
  node -e 'const s = require("net").createServer()
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address()
      s.close(() => { console.log(port) })
    })'
}

start_daemon() {
  local key_path=$1
  local out=$2
  ssh_port=$(free_port)
  http_port=$(free_port)
  [ -n "$ssh_port" ] && [ -n "$http_port" ] || return 1
  DATABASE_URL="$scratch_url" CARN_REPO_ROOT="$repo_root" \
    CARN_SSH_HOST_KEY="$key_path" CARN_SSH_HOST=127.0.0.1 \
    CARN_SSH_PORT="$ssh_port" HOST=127.0.0.1 PORT="$http_port" \
    node dist/src/index.js > "$out" 2>&1 &
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

repo_dirs() {
  find "$repo_root" -mindepth 2 -maxdepth 2 -name '*.git' 2>/dev/null | wc -l | tr -d ' '
}

# a pkt-line is its own length in four hex digits, prefix included
pkt() {
  printf '%04x%s' "$(( ${#1} + 4 ))" "$1"
}

v2_body() {
  pkt 'command=ls-refs
'
  pkt 'object-format=sha1
'
  printf '0001'
  pkt 'peel
'
  printf '0000'
}

# the repo path is the child's cwd, never its argv, so match on the parent
upload_pack_child() {
  local kid
  for kid in $(pgrep -P "$daemon_pid" 2>/dev/null); do
    if ps -o args= -p "$kid" 2>/dev/null | grep -q 'upload-pack'; then
      printf '%s' "$kid"
      return 0
    fi
  done
  return 1
}

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

scratch_db=""
scratch_url=""
scratch_ok=0
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

echo "Phase 1c exit checks"
echo

# taken before any work, so check 20 can prove the run added nothing
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

scratch_why=""
if setup_scratch; then
  scratch_ok=1
else
  scratch_why=$(tail -3 "$work/scratch.err" "$work/scratch.migrate" 2>/dev/null | tail -4)
fi

admin_key="$work/admin_key"
ssh-keygen -t ed25519 -N '' -C "admin@carn.invalid" -f "$admin_key" -q < /dev/null > /dev/null 2>&1

mkdir -p "$seed" "$repo_root"
git -C "$seed" init -q -b main > /dev/null 2>&1
printf 'first\n' > "$seed/README.md"
git -C "$seed" add README.md > /dev/null 2>&1
git -C "$seed" commit -q -m "first" > /dev/null 2>&1

# 2
# seeded over SSH so check 7 has two transports to compare
readonly TITLE_2="a clone over HTTP returns the seeded content"
if require_db 2 "$TITLE_2" && require_build 2 "$TITLE_2" && require_scratch 2 "$TITLE_2"; then
  DATABASE_URL="$scratch_url" npm run key:add -- "$admin_key.pub" carn-verify \
    > "$work/2.key" 2>&1
  key_status=$?
  if [ "$key_status" -ne 0 ]; then
    record FAIL 2 "$TITLE_2" "key:add failed: $(tail -3 "$work/2.key")"
  elif ! start_daemon "$host_key" "$work/daemon.log"; then
    record FAIL 2 "$TITLE_2" "the daemon did not start: $(tail -5 "$work/daemon.log" 2>/dev/null)"
  else
    daemon_ok=1
    as_user "$admin_key" git -C "$seed" push "$(url_for "$REPO_NAME")" main:refs/heads/main \
      > "$work/2.push" 2>&1
    push_status=$?
    if [ "$push_status" -ne 0 ]; then
      record FAIL 2 "$TITLE_2" "the SSH seed push failed: $(tail -5 "$work/2.push")"
    else
      seed_ok=1
      unset GIT_SSH_COMMAND
      bounded 60 git clone -q "$(http_url "$REPO_NAME")" "$work/clone" > "$work/2" 2>&1
      clone_status=$?
      if [ "$clone_status" -ne 0 ]; then
        record FAIL 2 "$TITLE_2" "exit $clone_status: $(tail -5 "$work/2")"
      elif ! diff -q "$seed/README.md" "$work/clone/README.md" > /dev/null 2>&1; then
        record FAIL 2 "$TITLE_2" "the cloned README.md differs from the pushed one"
      else
        record PASS 2 "$TITLE_2" "content matches the SSH-seeded repo"
      fi
    fi
  fi
fi

head_sha=""
if [ "$seed_ok" = 1 ]; then
  head_sha=$(git -C "$seed" rev-parse main 2>/dev/null)
fi

# 3
readonly TITLE_3="a clone over HTTP negotiates protocol v2"
if require_daemon 3 "$TITLE_3" && require_seed 3 "$TITLE_3"; then
  export GIT_TRACE_PACKET="$work/3.trace"
  bounded 60 git clone -q "$(http_url "$REPO_NAME")" "$work/clone-v2" > "$work/3" 2>&1
  v2_status=$?
  unset GIT_TRACE_PACKET
  version=$(grep -cE 'packet:.*< version 2$' "$work/3.trace" 2>/dev/null)
  lsrefs=$(grep -cE 'packet:.*> command=ls-refs' "$work/3.trace" 2>/dev/null)
  if [ "$v2_status" -ne 0 ]; then
    record FAIL 3 "$TITLE_3" "the clone failed: $(tail -5 "$work/3")"
  elif [ "${version:-0}" -gt 0 ] && [ "${lsrefs:-0}" -gt 0 ]; then
    record PASS 3 "$TITLE_3" "server answered 'version 2' and took a ls-refs command"
  else
    record FAIL 3 "$TITLE_3" "'version 2' seen $version time(s), ls-refs $lsrefs time(s)"
  fi
fi

# 4
readonly TITLE_4="protocol v0 clones and its advertisement opens with the service header"
if require_daemon 4 "$TITLE_4" && require_seed 4 "$TITLE_4"; then
  bounded 60 git -c protocol.version=0 clone -q "$(http_url "$REPO_NAME")" "$work/clone-v0" \
    > "$work/4" 2>&1
  v0_status=$?
  curl -sS --path-as-is --max-time 30 -o "$work/4.body" \
    "$(refs_url "$REPO_NAME" git-upload-pack)" > "$work/4.curl" 2>&1
  curl_status=$?
  opening=$(head -c 30 "$work/4.body" 2>/dev/null)
  flush=$(dd if="$work/4.body" bs=1 skip=30 count=4 2>/dev/null)
  if [ "$v0_status" -ne 0 ]; then
    record FAIL 4 "$TITLE_4" "the v0 clone failed: $(tail -5 "$work/4")"
  elif ! diff -q "$seed/README.md" "$work/clone-v0/README.md" > /dev/null 2>&1; then
    record FAIL 4 "$TITLE_4" "the v0 clone's README.md differs from the pushed one"
  elif [ "$curl_status" -ne 0 ]; then
    record FAIL 4 "$TITLE_4" "the raw advertisement request failed: $(tail -3 "$work/4.curl")"
  elif [ "$opening" != "$SERVICE_HEADER" ] || [ "$flush" != "0000" ]; then
    record FAIL 4 "$TITLE_4" "the body opens '$opening' then '$flush', wanted '$SERVICE_HEADER' then '0000'"
  else
    record PASS 4 "$TITLE_4" "clone clean, body opens with the 30-byte service header and a flush"
  fi
fi

# 5
# check 4's opposite branch, asserted alone: a header here corrupts v2
readonly TITLE_5="under v2 the advertisement carries no service header"
if require_daemon 5 "$TITLE_5" && require_seed 5 "$TITLE_5"; then
  curl -sS --path-as-is --max-time 30 -H 'Git-Protocol: version=2' -o "$work/5.body" \
    "$(refs_url "$REPO_NAME" git-upload-pack)" > "$work/5.curl" 2>&1
  curl_status=$?
  opening=$(head -c 14 "$work/5.body" 2>/dev/null)
  leading=$(head -c 30 "$work/5.body" 2>/dev/null)
  if [ "$curl_status" -ne 0 ]; then
    record FAIL 5 "$TITLE_5" "the raw advertisement request failed: $(tail -3 "$work/5.curl")"
  elif [ "$leading" = "$SERVICE_HEADER" ]; then
    record FAIL 5 "$TITLE_5" "the v2 body carries the v0 service header"
  elif [ "$opening" != "$(printf '000eversion 2\n')" ]; then
    record FAIL 5 "$TITLE_5" "the body opens '$(head -c 30 "$work/5.body" | tr -d '\n')', wanted '000eversion 2'"
  else
    record PASS 5 "$TITLE_5" "body opens '000eversion 2', no service header"
  fi
fi

# 6
# the plain send is the control, so a gzipped pass is the gunzip path
readonly TITLE_6="a gzipped POST body is accepted"
if require_daemon 6 "$TITLE_6" && require_seed 6 "$TITLE_6"; then
  v2_body > "$work/6.req"
  gzip -c "$work/6.req" > "$work/6.req.gz"
  curl -sS --path-as-is --max-time 30 -o "$work/6.plain" \
    -H "Content-Type: $UPLOAD_TYPE" -H 'Git-Protocol: version=2' \
    --data-binary "@$work/6.req" "$(http_url "$REPO_NAME")/git-upload-pack" \
    > "$work/6.plain.curl" 2>&1
  plain_status=$?
  curl -sS --path-as-is --max-time 30 -o "$work/6.gzip" \
    -H "Content-Type: $UPLOAD_TYPE" -H 'Content-Encoding: gzip' \
    -H 'Git-Protocol: version=2' \
    --data-binary "@$work/6.req.gz" "$(http_url "$REPO_NAME")/git-upload-pack" \
    > "$work/6.gzip.curl" 2>&1
  gzip_status=$?
  if [ "$plain_status" -ne 0 ] || ! grep -qF "refs/heads/main" "$work/6.plain"; then
    record FAIL 6 "$TITLE_6" "the uncompressed control failed first, so the payload is wrong: exit $plain_status, $(head -c 120 "$work/6.plain" | tr -d '\0')"
  elif [ "$gzip_status" -ne 0 ]; then
    record FAIL 6 "$TITLE_6" "the gzipped request failed: $(tail -3 "$work/6.gzip.curl")"
  elif ! grep -qF "refs/heads/main" "$work/6.gzip"; then
    record FAIL 6 "$TITLE_6" "the gzipped response never lists refs/heads/main: $(head -c 120 "$work/6.gzip" | tr -d '\0')"
  elif ! diff -q "$work/6.plain" "$work/6.gzip" > /dev/null 2>&1; then
    record FAIL 6 "$TITLE_6" "gzipped and plain answers differ"
  else
    record PASS 6 "$TITLE_6" "$(wc -c < "$work/6.req" | tr -d ' ') bytes plain and $(wc -c < "$work/6.req.gz" | tr -d ' ') gzipped give the same refs"
  fi
fi

# 7
readonly TITLE_7="ls-remote lists the same refs over HTTP as over SSH"
if require_daemon 7 "$TITLE_7" && require_seed 7 "$TITLE_7"; then
  as_user "$admin_key" git ls-remote "$(url_for "$REPO_NAME")" > "$work/7.ssh" 2>"$work/7.ssh.err"
  ssh_status=$?
  unset GIT_SSH_COMMAND
  bounded 60 git ls-remote "$(http_url "$REPO_NAME")" > "$work/7.http" 2>"$work/7.http.err"
  http_status=$?
  if [ "$ssh_status" -ne 0 ]; then
    record FAIL 7 "$TITLE_7" "ls-remote over SSH failed: $(tail -3 "$work/7.ssh.err")"
  elif [ "$http_status" -ne 0 ]; then
    record FAIL 7 "$TITLE_7" "ls-remote over HTTP failed: $(tail -3 "$work/7.http.err")"
  elif [ ! -s "$work/7.ssh" ]; then
    record FAIL 7 "$TITLE_7" "ls-remote over SSH listed nothing"
  elif diff -q "$work/7.ssh" "$work/7.http" > /dev/null 2>&1; then
    record PASS 7 "$TITLE_7" "$(grep -c . "$work/7.ssh") ref(s) byte-identical across transports"
  else
    record FAIL 7 "$TITLE_7" "$(diff "$work/7.ssh" "$work/7.http" | head -6)"
  fi
fi

# 8
readonly TITLE_8="a push over HTTP fails and the message names SSH"
if require_daemon 8 "$TITLE_8" && require_seed 8 "$TITLE_8"; then
  unset GIT_SSH_COMMAND
  bounded 60 git -C "$seed" push "$(http_url "$REPO_NAME")" main:refs/heads/main \
    > "$work/8" 2>&1
  http_push_status=$?
  before=$(git -C "$seed" rev-parse main 2>/dev/null)
  if [ "$http_push_status" -eq 0 ]; then
    record FAIL 8 "$TITLE_8" "the push succeeded"
  elif ! grep -qF "$NO_HTTP_PUSH" "$work/8"; then
    record FAIL 8 "$TITLE_8" "wanted \"$NO_HTTP_PUSH\", got: $(tail -3 "$work/8")"
  else
    record PASS 8 "$TITLE_8" "exit $http_push_status, refused by name at $before"
  fi
fi

# 9
readonly TITLE_9="info/refs for git-receive-pack refuses, naming SSH"
if require_daemon 9 "$TITLE_9" && require_seed 9 "$TITLE_9"; then
  status=$(curl -sS --path-as-is --max-time 30 -o "$work/9.body" -w '%{http_code}' \
    "$(refs_url "$REPO_NAME" git-receive-pack)" 2>"$work/9.err")
  if [ "$status" != "403" ]; then
    record FAIL 9 "$TITLE_9" "the server answered ${status:-nothing}, wanted 403: $(tail -3 "$work/9.err")"
  elif ! grep -qF "$NO_HTTP_PUSH" "$work/9.body"; then
    record FAIL 9 "$TITLE_9" "wanted \"$NO_HTTP_PUSH\", got: $(head -c 200 "$work/9.body")"
  else
    record PASS 9 "$TITLE_9" "403 with the SSH remote shape on the body"
  fi
fi

# 10
readonly TITLE_10="both endpoints send the three no-cache headers and the right type"
if require_daemon 10 "$TITLE_10" && require_seed 10 "$TITLE_10"; then
  curl -sS --path-as-is --max-time 30 -D "$work/10.get" -o /dev/null \
    "$(refs_url "$REPO_NAME" git-upload-pack)" > "$work/10.err" 2>&1
  get_status=$?
  v2_body > "$work/10.req"
  curl -sS --path-as-is --max-time 30 -D "$work/10.post" -o /dev/null \
    -H "Content-Type: $UPLOAD_TYPE" -H 'Git-Protocol: version=2' \
    --data-binary "@$work/10.req" "$(http_url "$REPO_NAME")/git-upload-pack" \
    >> "$work/10.err" 2>&1
  post_status=$?
  missing=""
  for header in 'Cache-Control: no-cache, max-age=0, must-revalidate' \
    'Expires: Fri, 01 Jan 1980 00:00:00 GMT' \
    'Pragma: no-cache'; do
    grep -qiF "$header" "$work/10.get" || missing="$missing GET lacks '$header';"
    grep -qiF "$header" "$work/10.post" || missing="$missing POST lacks '$header';"
  done
  grep -qiF 'Content-Type: application/x-git-upload-pack-advertisement' "$work/10.get" \
    || missing="$missing GET type is '$(grep -i '^content-type' "$work/10.get" | tr -d '\r')';"
  grep -qiF 'Content-Type: application/x-git-upload-pack-result' "$work/10.post" \
    || missing="$missing POST type is '$(grep -i '^content-type' "$work/10.post" | tr -d '\r')';"
  if [ "$get_status" -ne 0 ] || [ "$post_status" -ne 0 ]; then
    record FAIL 10 "$TITLE_10" "a request failed: GET exit $get_status, POST exit $post_status"
  elif [ -n "$missing" ]; then
    record FAIL 10 "$TITLE_10" "$missing"
  else
    record PASS 10 "$TITLE_10" "three headers and the right type on both"
  fi
fi

# 11
readonly TITLE_11="an unknown repo answers 404 and creates nothing"
if require_daemon 11 "$TITLE_11" && require_scratch 11 "$TITLE_11"; then
  dirs_before=$(repo_dirs)
  status=$(curl -sS --path-as-is --max-time 30 -o "$work/11.body" -w '%{http_code}' \
    "$(refs_url "$ABSENT_NAME" git-upload-pack)" 2>"$work/11.err")
  rows=$(psql_scratch -c "select count(*) from repos where lower(name) = '$ABSENT_NAME'")
  dirs_after=$(repo_dirs)
  if [ "$status" != "404" ]; then
    record FAIL 11 "$TITLE_11" "the server answered ${status:-nothing}, wanted 404: $(tail -3 "$work/11.err")"
  elif ! grep -qF "$NO_REPO" "$work/11.body"; then
    record FAIL 11 "$TITLE_11" "wanted \"$NO_REPO\", got: $(head -c 200 "$work/11.body")"
  elif [ "$rows" = "0" ] && [ "$dirs_before" = "$dirs_after" ]; then
    record PASS 11 "$TITLE_11" "no row, still $dirs_after repo(s) on disk"
  else
    record FAIL 11 "$TITLE_11" "$rows row(s), repos on disk went $dirs_before to $dirs_after"
  fi
fi

# 12
# the refusal is the oracle: badName is emitted on the only branch that
# precedes the query, and check 11 proves a queried name answers differently
readonly TITLE_12="an invalid repo name is refused before the query"
if require_daemon 12 "$TITLE_12" && require_scratch 12 "$TITLE_12"; then
  dirs_before=$(repo_dirs)
  long_name=$(printf 'a%.0s' $(seq 65))
  bad=""
  # ../etc must arrive encoded or the router never sees it as one segment
  for name in '%2e%2e%2fetc' '-x' '.hidden' "$long_name"; do
    status=$(curl -sS --path-as-is --max-time 30 -o "$work/12.body" -w '%{http_code}' \
      "$(refs_url "$name" git-upload-pack)" 2>/dev/null)
    if [ "$status" != "404" ]; then
      bad="$bad '$name' answered ${status:-nothing};"
    elif ! grep -qF "$BAD_NAME" "$work/12.body"; then
      bad="$bad '$name' drew '$(head -c 80 "$work/12.body" | tr -d '\n')';"
    fi
  done
  rows=$(psql_scratch -c "select count(*) from repos")
  dirs_after=$(repo_dirs)
  if [ -n "$bad" ]; then
    record FAIL 12 "$TITLE_12" "$bad"
  elif [ "$rows" = "1" ] && [ "$dirs_before" = "$dirs_after" ] && [ ! -e "$work/etc" ]; then
    record PASS 12 "$TITLE_12" "4 names refused, still $rows row and $dirs_after repo on disk"
  else
    record FAIL 12 "$TITLE_12" "$rows row(s), repos on disk went $dirs_before to $dirs_after"
  fi
fi

# 13
# ps cannot see the repo root: it is the child's cwd, never its argv. Match
# the child by its parent instead, and prove it was alive before the kill
readonly TITLE_13="a client disconnecting mid-clone kills the git child"
if require_daemon 13 "$TITLE_13" && require_seed 13 "$TITLE_13"; then
  # a POST that promises a body and never sends one blocks upload-pack
  node -e '
    const net = require("net")
    const [port, path] = process.argv.slice(1)
    const socket = net.connect(Number(port), "127.0.0.1", () => {
      socket.write(
        `POST ${path} HTTP/1.1\r\n` +
        "Host: 127.0.0.1\r\n" +
        "Content-Type: application/x-git-upload-pack-request\r\n" +
        "Content-Length: 100000\r\n\r\n",
      )
    })
    socket.on("data", () => {})
    socket.on("error", () => {})
    setTimeout(() => { socket.destroy() }, 60000)
  ' "$http_port" "/r/$REPO_NAME/git-upload-pack" > "$work/13.holder" 2>&1 &
  holder_pid=$!
  child_pid=""
  waited=0
  while [ "$waited" -lt 40 ]; do
    child_pid=$(upload_pack_child) && [ -n "$child_pid" ] && break
    child_pid=""
    sleep 0.25
    waited=$((waited + 1))
  done
  if [ -z "$child_pid" ]; then
    kill -9 "$holder_pid" 2>/dev/null
    wait "$holder_pid" 2>/dev/null
    record FAIL 13 "$TITLE_13" "no upload-pack child of the daemon ever appeared, so the kill is untested"
  elif ! kill -0 "$child_pid" 2>/dev/null; then
    kill -9 "$holder_pid" 2>/dev/null
    wait "$holder_pid" 2>/dev/null
    record FAIL 13 "$TITLE_13" "the child $child_pid was gone before the disconnect"
  else
    kill -9 "$holder_pid" 2>/dev/null
    wait "$holder_pid" 2>/dev/null
    waited=0
    while kill -0 "$child_pid" 2>/dev/null && [ "$waited" -lt 40 ]; do
      sleep 0.25
      waited=$((waited + 1))
    done
    if kill -0 "$child_pid" 2>/dev/null; then
      record FAIL 13 "$TITLE_13" "upload-pack $child_pid survived the disconnect: $(ps -o args= -p "$child_pid" 2>/dev/null)"
    else
      record PASS 13 "$TITLE_13" "upload-pack $child_pid was alive before the disconnect and gone after"
    fi
  fi
fi

stop_daemon
unset GIT_SSH_COMMAND

# torn down here, not at check 20: verify-phase-1b.sh's own check 23 counts
# every carn_verify_% database, and would read this run's as a stray
drop_scratch
rm -rf "$repo_root"

# 14
readonly TITLE_14="the concurrency limit has one definition and both transports share it"
# assembled, so the definition this looks for is not written out here
concurrency_def=$(printf 'export const %s' gitConcurrency)
concurrency_hits=$(git grep --untracked -c "$concurrency_def" -- src test scripts prisma)
concurrency_count=$(printf '%s\n' "$concurrency_hits" | grep -c .)
own_semaphore=$(git grep --untracked -n 'new Semaphore' -- src/routes/git-http.ts src/ssh)
# the shared limit reaches a transport through spawnGit, not the constant
spawn_users=$(git grep --untracked -lE 'spawnGit|runGit' -- src/routes/git-http.ts src/ssh/exec.ts | sort | tr '\n' ' ')
if [ "$concurrency_count" != "1" ] || [ "$concurrency_hits" != "src/git/spawn.ts:1" ]; then
  record FAIL 14 "$TITLE_14" "'$concurrency_def' found at: ${concurrency_hits:-nowhere}"
elif [ -n "$own_semaphore" ]; then
  record FAIL 14 "$TITLE_14" "a transport builds its own Semaphore: $own_semaphore"
elif [ "$spawn_users" != "src/routes/git-http.ts src/ssh/exec.ts " ]; then
  record FAIL 14 "$TITLE_14" "the transports reaching spawn.ts are: ${spawn_users:-none}"
else
  record PASS 14 "$TITLE_14" "defined once in src/git/spawn.ts, reached by both transports through spawnGit"
fi

# 15
# spelled as a pattern so this script is not itself a hit
spawn_shell='shell:[[:space:]]*true'
printf 'spawn(cmd, { %s: %s })\n' shell true > "$work/15.control"
if ! grep -qE "$spawn_shell" "$work/15.control"; then
  record FAIL 15 "no shell-enabled spawn in source" "the pattern does not match a known violation; it cannot gate"
else
  # source only: docs quote the rule, --untracked sees uncommitted files
  hits=$(git grep --untracked -nE "$spawn_shell" -- src test scripts prisma prisma.config.ts)
  if [ -z "$hits" ]; then
    record PASS 15 "no shell-enabled spawn in source"
  else
    record FAIL 15 "no shell-enabled spawn in source" "$hits"
  fi
fi

# 16
# a git pathspec * crosses /, so src/**/*.ts would skip src/config.ts
readonly TITLE_16="every .ts under src, test and scripts opens with the SPDX line"
spdx_line='// SPDX-License-Identifier: AGPL-3.0-or-later'
# positive control: prove the comparison below can tell a header from none
printf '%s\n' "$spdx_line" > "$work/16.good"
printf 'no header\n' > "$work/16.bad"
if [ "$(head -1 "$work/16.good")" != "$spdx_line" ] || [ "$(head -1 "$work/16.bad")" = "$spdx_line" ]; then
  record FAIL 16 "$TITLE_16" "the header comparison does not discriminate; it cannot gate"
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
    record FAIL 16 "$TITLE_16" "no source files enumerated"
  elif [ "$source_count" != "$found_count" ]; then
    record FAIL 16 "$TITLE_16" "git listed $source_count files, find listed $found_count"
  elif [ -n "$unstamped" ]; then
    record FAIL 16 "$TITLE_16" "missing on:$unstamped"
  else
    record PASS 16 "$TITLE_16" "$source_count files checked"
  fi
fi

# 17
# the budget catches unauthorised creep, so a later phase's authorised
# additions belong in it: 1d's four are named in docs/phases/1d-design.md
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
  if (over.length) { console.error("outside 1b plus the four 1d adds: " + over.join(", ")); process.exit(1) }
  for (const name of ["ssh2", "@types/ssh2"]) {
    const field = name.startsWith("@types/") ? "devDependencies" : "dependencies"
    if (!pkg[field]?.[name]) { console.error(`${name} is not in ${field}`); process.exit(1) }
  }
' > "$work/17" 2>&1; then
  record PASS 17 "dependencies are 1b's plus 1d's four, and 1c adds none"
else
  record FAIL 17 "dependencies are 1b's plus 1d's four, and 1c adds none" "$(cat "$work/17")"
fi

# 18
# a zero-match glob exits 0, so the file list is built before linting
readonly TITLE_18="the migration set is 1b's and squawk still finds no issues"
sql=()
while IFS= read -r file; do
  sql+=("$file")
done < <(find prisma/migrations -name '*.sql' 2>/dev/null | sort)
applied=$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d 2>/dev/null \
  | sed 's#.*/##' | sort | tr '\n' ' ')
if [ "${#sql[@]}" -eq 0 ]; then
  record FAIL 18 "$TITLE_18" "no migration SQL found to lint"
elif [ "$applied" != "$MIGRATIONS " ]; then
  record FAIL 18 "$TITLE_18" "migrations are '$applied', 1b left '$MIGRATIONS'"
elif npx squawk "${sql[@]}" > "$work/18" 2>&1; then
  record PASS 18 "$TITLE_18" "${#sql[@]} file(s) linted, set unchanged"
else
  record FAIL 18 "$TITLE_18" "$(tail -10 "$work/18")"
fi

# 19
# after the daemon is down: 1a's check 9 needs port 3000 and rebuilds dist
readonly TITLE_19="verify-phase-1a.sh and verify-phase-1b.sh still pass in full"
if require_db 19 "$TITLE_19"; then
  ./scripts/verify-phase-1a.sh > "$work/19.1a" 2>&1
  phase_1a_status=$?
  ./scripts/verify-phase-1b.sh > "$work/19.1b" 2>&1
  phase_1b_status=$?
  if [ "$phase_1a_status" -ne 0 ]; then
    record FAIL 19 "$TITLE_19" "$(grep '^FAIL' "$work/19.1a" | head -5)
$(tail -1 "$work/19.1a")"
  elif [ "$phase_1b_status" -ne 0 ]; then
    record FAIL 19 "$TITLE_19" "$(grep '^FAIL' "$work/19.1b" | head -5)
$(tail -1 "$work/19.1b")"
  else
    record PASS 19 "$TITLE_19" "$(tail -1 "$work/19.1a"), $(tail -1 "$work/19.1b")"
  fi
fi

# 20
readonly TITLE_20="the run leaves no scratch database, rows, or repos behind"
if require_db 20 "$TITLE_20"; then
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
    record PASS 20 "$TITLE_20" "development database still $dev_rows repos:ssh_keys"
  else
    record FAIL 20 "$TITLE_20" "$left"
  fi
fi

ran=$(grep -c . "$log")
fails=$(grep -c '^FAIL ' "$log")

echo
if [ "$fails" -eq 0 ] && [ "$ran" -eq "$EXPECTED_CHECKS" ]; then
  echo "Phase 1c: $ran of $EXPECTED_CHECKS checks passed."
  exit 0
fi
echo "Phase 1c: $fails failing, $ran of $EXPECTED_CHECKS checks ran."
exit 1

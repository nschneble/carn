#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Phase 1b exit checks, from docs/phases/1b-ssh.md.
# Prints PASS or FAIL for each of the 23 checks and exits non-zero if any
# fail. Reads DATABASE_URL from the environment, falling back to ./.env.
# State lands in three places; the EXIT trap tears down all three.

# not set -e: this runs commands expected to fail and reads their status
set -uo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

readonly EXPECTED_CHECKS=23
readonly REPO_NAME=verify1b
readonly DEFAULT_ROOT=./local/repos
readonly SSH_FLAGS="-o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=5"
readonly NO_WRITE="You don't have write access to $REPO_NAME. Ask the owner for a grant."
readonly NO_REPO="There's no repo named absent1b. Push to it to create it."
readonly BAD_COMMAND="This server runs git-upload-pack and git-receive-pack only. Use git clone or git push."
readonly BAD_NAME="That's not a valid repo name. Names are up to 64 characters, starting with a letter or number, and containing only letters, numbers, dots, dashes, and underscores."

work=$(mktemp -d) || work=""
if [ -z "$work" ]; then
  echo "verify-phase-1b: gave no temp directory" >&2
  exit 1
fi
readonly work
readonly log="$work/results"
readonly repo_root="$work/repos"
readonly host_key="$work/ssh_host_ed25519_key"
readonly seed="$work/seed"
: > "$log"

# a hermetic client: the developer's protocol.version or insteadOf would
# otherwise decide what checks 7 and 13 actually send
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
    record FAIL "$1" "$2" "the ssh daemon is not running, see check 3"
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
    # ssh2.Server has no .listening at runtime, so poll the port itself
    nc -z 127.0.0.1 "$ssh_port" 2>/dev/null && return 0
    sleep 0.25
    waited=$((waited + 1))
  done
  return 1
}

host_fingerprint() {
  ssh-keyscan -T 5 -p "$ssh_port" -t ed25519 127.0.0.1 2>/dev/null \
    | ssh-keygen -lf - 2>/dev/null | awk '{print $2}'
}

repo_dirs() {
  find "$repo_root" -mindepth 2 -maxdepth 2 -name '*.git' 2>/dev/null | wc -l | tr -d ' '
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

echo "Phase 1b exit checks"
echo

# taken before any work, so check 23 can prove the run added nothing
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
elif npm run build >> "$work/1" 2>&1 && [ -f dist/src/index.js ] && [ -f dist/scripts/add-key.js ]; then
  build_ok=1
  record PASS 1 "npm ci and npm run build are clean under strict"
else
  record FAIL 1 "npm ci and npm run build are clean under strict" "$(tail -10 "$work/1")"
fi

# 2
scratch_why=""
if setup_scratch; then
  scratch_ok=1
else
  scratch_why=$(tail -3 "$work/scratch.err" "$work/scratch.migrate" 2>/dev/null | tail -4)
fi

admin_key="$work/admin_key"
other_key="$work/other_key"
stranger_key="$work/stranger_key"
for key in "$admin_key" "$other_key" "$stranger_key"; do
  ssh-keygen -t ed25519 -N '' -C "$(basename "$key")@carn.invalid" -f "$key" -q < /dev/null > /dev/null 2>&1
done

if require_db 2 "key:add stores the fingerprint ssh-keygen reports" && require_build 2 "key:add stores the fingerprint ssh-keygen reports" && require_scratch 2 "key:add stores the fingerprint ssh-keygen reports"; then
  DATABASE_URL="$scratch_url" npm run key:add -- "$admin_key.pub" carn-verify \
    > "$work/2" 2>&1
  add_status=$?
  expected_fp=$(ssh-keygen -lf "$admin_key.pub" | awk '{print $2}')
  stored=$(psql_scratch -c "select count(*) || ' ' || coalesce(max(fingerprint), '')  from ssh_keys" 2>&1)
  if [ "$add_status" -ne 0 ]; then
    record FAIL 2 "key:add stores the fingerprint ssh-keygen reports" "$(tail -5 "$work/2")"
  elif [ "$stored" = "1 $expected_fp" ]; then
    record PASS 2 "key:add stores the fingerprint ssh-keygen reports" "$expected_fp"
  else
    record FAIL 2 "key:add stores the fingerprint ssh-keygen reports" "row is '$stored', ssh-keygen says '1 $expected_fp'"
  fi
fi

# 3
mkdir -p "$seed" "$repo_root"
git -C "$seed" init -q -b main > /dev/null 2>&1
printf 'first\n' > "$seed/README.md"
git -C "$seed" add README.md > /dev/null 2>&1
git -C "$seed" commit -q -m "first" > /dev/null 2>&1

if require_build 3 "a push to an unknown name succeeds" && require_scratch 3 "a push to an unknown name succeeds"; then
  if ! start_daemon "$host_key" "$work/daemon.log"; then
    record FAIL 3 "a push to an unknown name succeeds" "the daemon did not start: $(tail -5 "$work/daemon.log" 2>/dev/null)"
  else
    daemon_ok=1
    as_user "$admin_key" git -C "$seed" push "$(url_for "$REPO_NAME")" main:refs/heads/main \
      > "$work/3" 2>&1
    push_status=$?
    if [ "$push_status" -eq 0 ]; then
      record PASS 3 "a push to an unknown name succeeds"
    else
      record FAIL 3 "a push to an unknown name succeeds" "exit $push_status: $(tail -5 "$work/3")"
    fi
  fi
fi

# 4
repo_id=""
repo_dir=""
if require_daemon 4 "the push made one row and a repo at the path its id derives" && require_scratch 4 "the push made one row and a repo at the path its id derives"; then
  repo_id=$(psql_scratch -c "select id from repos where name = '$REPO_NAME'")
  rows=$(psql_scratch -c "select count(*) from repos")
  repo_dir="$repo_root/${repo_id:0:2}/$repo_id.git"
  if [ "$rows" != "1" ] || [ -z "$repo_id" ]; then
    record FAIL 4 "the push made one row and a repo at the path its id derives" "repos holds $rows row(s), and '$REPO_NAME' is ${repo_id:-absent}"
  elif [ ! -d "$repo_dir" ]; then
    record FAIL 4 "the push made one row and a repo at the path its id derives" "nothing at $repo_dir; the tree holds $(repo_dirs) repo(s)"
  else
    record PASS 4 "the push made one row and a repo at the path its id derives" "${repo_id:0:2}/$repo_id.git"
  fi
fi

# 5
if require_daemon 5 "HEAD tracks default_branch and the five config values are set"; then
  branch=$(psql_scratch -c "select default_branch from repos where name = '$REPO_NAME'")
  head=$(cat "$repo_dir/HEAD" 2>/dev/null)
  wrong=""
  [ "$head" = "ref: refs/heads/$branch" ] || wrong="HEAD is '${head:-unreadable}', wanted 'ref: refs/heads/$branch';"
  while IFS='=' read -r key want; do
    got=$(git --git-dir="$repo_dir" config --get "$key" 2>/dev/null)
    [ "$got" = "$want" ] || wrong="$wrong $key is '${got:-unset}', wanted '$want';"
  done <<< "core.logAllRefUpdates=true
pack.threads=1
pack.windowMemory=64m
receive.autogc=false
receive.maxInputSize=100m"
  if [ -z "$wrong" ]; then
    record PASS 5 "HEAD tracks default_branch and the five config values are set"
  else
    record FAIL 5 "HEAD tracks default_branch and the five config values are set" "$wrong"
  fi
fi

# 6
if require_daemon 6 "a clone returns the pushed content"; then
  as_user "$admin_key" git clone -q "$(url_for "$REPO_NAME")" "$work/clone" \
    > "$work/6" 2>&1
  clone_status=$?
  if [ "$clone_status" -ne 0 ]; then
    record FAIL 6 "a clone returns the pushed content" "exit $clone_status: $(tail -5 "$work/6")"
  elif diff -q "$seed/README.md" "$work/clone/README.md" > /dev/null 2>&1; then
    record PASS 6 "a clone returns the pushed content"
  else
    record FAIL 6 "a clone returns the pushed content" "the cloned README.md differs from the pushed one"
  fi
fi

# 7
if require_daemon 7 "a clone negotiates protocol v2"; then
  export GIT_TRACE_PACKET="$work/7.trace"
  as_user "$admin_key" git clone -q "$(url_for "$REPO_NAME")" "$work/clone-v2" \
    > "$work/7" 2>&1
  v2_status=$?
  unset GIT_TRACE_PACKET
  # git tags packet lines with the command name, so clone< not git<
  version=$(grep -cE 'packet:.*< version 2$' "$work/7.trace" 2>/dev/null)
  lsrefs=$(grep -cE 'packet:.*> command=ls-refs$' "$work/7.trace" 2>/dev/null)
  if [ "$v2_status" -ne 0 ]; then
    record FAIL 7 "a clone negotiates protocol v2" "the clone failed: $(tail -5 "$work/7")"
  elif [ "${version:-0}" -gt 0 ] && [ "${lsrefs:-0}" -gt 0 ]; then
    record PASS 7 "a clone negotiates protocol v2" "server answered 'version 2' and took a ls-refs command"
  else
    record FAIL 7 "a clone negotiates protocol v2" "'version 2' seen $version time(s), ls-refs $lsrefs time(s)"
  fi
fi

# 8
if require_daemon 8 "a second push updates the repo and adds no row"; then
  printf 'second\n' > "$seed/NOTES.md"
  git -C "$seed" add NOTES.md > /dev/null 2>&1
  git -C "$seed" commit -q -m "second" > /dev/null 2>&1
  as_user "$admin_key" git -C "$seed" push "$(url_for "$REPO_NAME")" main:refs/heads/main \
    > "$work/8" 2>&1
  second_status=$?
  rows=$(psql_scratch -c "select count(*) from repos")
  remote_sha=$(git --git-dir="$repo_dir" rev-parse refs/heads/main 2>/dev/null)
  local_sha=$(git -C "$seed" rev-parse main 2>/dev/null)
  if [ "$second_status" -ne 0 ]; then
    record FAIL 8 "a second push updates the repo and adds no row" "exit $second_status: $(tail -5 "$work/8")"
  elif [ "$rows" != "1" ]; then
    record FAIL 8 "a second push updates the repo and adds no row" "repos holds $rows row(s)"
  elif [ -n "$local_sha" ] && [ "$remote_sha" = "$local_sha" ]; then
    record PASS 8 "a second push updates the repo and adds no row" "refs/heads/main is $local_sha"
  else
    record FAIL 8 "a second push updates the repo and adds no row" "remote is '${remote_sha:-unset}', local is '${local_sha:-unset}'"
  fi
fi

# 9
if require_daemon 9 "the key's last_used_at is set and later than created_at"; then
  used=$(psql_scratch -c "select count(*) from ssh_keys where last_used_at is not null and last_used_at > created_at")
  total=$(psql_scratch -c "select count(*) from ssh_keys")
  if [ "$used" = "$total" ] && [ "${total:-0}" -gt 0 ]; then
    record PASS 9 "the key's last_used_at is set and later than created_at" "$used of $total key(s)"
  else
    record FAIL 9 "the key's last_used_at is set and later than created_at" "${used:-0} of ${total:-0} key(s) carry a later last_used_at"
  fi
fi

# 10
if require_daemon 10 "an unregistered key is rejected with ssh exit 255"; then
  bounded 60 ssh -n $SSH_FLAGS -i "$stranger_key" -p "$ssh_port" \
    git@127.0.0.1 "git-upload-pack '$REPO_NAME'" > "$work/10" 2>&1
  stranger_status=$?
  if [ "$stranger_status" -eq 255 ]; then
    record PASS 10 "an unregistered key is rejected with ssh exit 255"
  else
    record FAIL 10 "an unregistered key is rejected with ssh exit 255" "exit $stranger_status: $(tail -3 "$work/10")"
  fi
fi

# 11
if require_daemon 11 "a key without a write grant cannot push, and no ref moves"; then
  other_fp=$(ssh-keygen -lf "$other_key.pub" | awk '{print $2}')
  other_pub=$(awk '{print $1 " " $2}' "$other_key.pub")
  psql -v ON_ERROR_STOP=1 "$scratch_url" --no-psqlrc -q -c "
    INSERT INTO users (id, handle, display_name, email, is_admin)
      VALUES (gen_random_uuid(), 'verify-other', 'Verify Other', 'other@carn.invalid', false);
    INSERT INTO ssh_keys (id, user_id, name, public_key, fingerprint)
      VALUES (gen_random_uuid(), (SELECT id FROM users WHERE handle = 'verify-other'),
              'verify-other', '$other_pub', '$other_fp');" > "$work/11.setup" 2>&1
  fixture_status=$?
  before=$(git --git-dir="$repo_dir" rev-parse refs/heads/main 2>/dev/null)
  printf 'third\n' > "$seed/DENIED.md"
  git -C "$seed" add DENIED.md > /dev/null 2>&1
  git -C "$seed" commit -q -m "third" > /dev/null 2>&1
  as_user "$other_key" git -C "$seed" push "$(url_for "$REPO_NAME")" main:refs/heads/main \
    > "$work/11" 2>&1
  denied_status=$?
  after=$(git --git-dir="$repo_dir" rev-parse refs/heads/main 2>/dev/null)
  if [ "$fixture_status" -ne 0 ]; then
    record FAIL 11 "a key without a write grant cannot push, and no ref moves" "the second user did not insert: $(tail -3 "$work/11.setup")"
  elif [ "$denied_status" -eq 0 ]; then
    record FAIL 11 "a key without a write grant cannot push, and no ref moves" "the push succeeded"
  elif ! grep -qF "$NO_WRITE" "$work/11"; then
    record FAIL 11 "a key without a write grant cannot push, and no ref moves" "wanted \"$NO_WRITE\", got: $(tail -3 "$work/11")"
  elif [ -n "$before" ] && [ "$before" = "$after" ]; then
    record PASS 11 "a key without a write grant cannot push, and no ref moves" "refused by message, refs/heads/main still $before"
  else
    record FAIL 11 "a key without a write grant cannot push, and no ref moves" "refs/heads/main moved from '${before:-unset}' to '${after:-unset}'"
  fi
fi

# 12
if require_daemon 12 "upload-pack on an unknown name fails and creates nothing"; then
  dirs_before=$(repo_dirs)
  as_user "$admin_key" git ls-remote "$(url_for absent1b)" > "$work/12" 2>&1
  absent_status=$?
  rows=$(psql_scratch -c "select count(*) from repos where lower(name) = 'absent1b'")
  dirs_after=$(repo_dirs)
  if [ "$absent_status" -eq 0 ]; then
    record FAIL 12 "upload-pack on an unknown name fails and creates nothing" "the request succeeded"
  elif ! grep -qF "$NO_REPO" "$work/12"; then
    record FAIL 12 "upload-pack on an unknown name fails and creates nothing" "wanted \"$NO_REPO\", got: $(tail -3 "$work/12")"
  elif [ "$rows" = "0" ] && [ "$dirs_before" = "$dirs_after" ]; then
    record PASS 12 "upload-pack on an unknown name fails and creates nothing" "no row, still $dirs_after repo(s) on disk"
  else
    record FAIL 12 "upload-pack on an unknown name fails and creates nothing" "$rows row(s), repos on disk went $dirs_before to $dirs_after"
  fi
fi

# 13
# the refusal is the oracle: badName is emitted on the only branch that
# precedes the query, and check 12 proves a queried name answers differently
if require_daemon 13 "a name failing the format regex is refused before the query"; then
  dirs_before=$(repo_dirs)
  long_name=$(printf 'a%.0s' $(seq 65))
  bad=""
  for name in '../etc' '-x' '.hidden' "$long_name"; do
    as_user "$admin_key" git ls-remote "$(url_for "$name")" > "$work/13" 2>&1
    name_status=$?
    if [ "$name_status" -eq 0 ]; then
      bad="$bad '$name' was accepted;"
    elif ! grep -qF "$BAD_NAME" "$work/13"; then
      bad="$bad '$name' drew '$(tail -2 "$work/13" | head -1)';"
    fi
  done
  rows=$(psql_scratch -c "select count(*) from repos")
  dirs_after=$(repo_dirs)
  if [ -n "$bad" ]; then
    record FAIL 13 "a name failing the format regex is refused before the query" "$bad"
  elif [ "$rows" = "1" ] && [ "$dirs_before" = "$dirs_after" ] && [ ! -e "$work/etc" ]; then
    record PASS 13 "a name failing the format regex is refused before the query" "4 names refused, still $rows row and $dirs_after repo on disk"
  else
    record FAIL 13 "a name failing the format regex is refused before the query" "$rows row(s), repos on disk went $dirs_before to $dirs_after"
  fi
fi

# 14
if require_daemon 14 "a shell request and a non-git command are both refused"; then
  # -n: a shell request that blocks on the caller's tty would look refused
  bounded 60 ssh -n $SSH_FLAGS -i "$admin_key" -p "$ssh_port" git@127.0.0.1 \
    > "$work/14.shell.out" 2> "$work/14.shell.err"
  shell_status=$?
  bounded 60 ssh -n $SSH_FLAGS -i "$admin_key" -p "$ssh_port" git@127.0.0.1 id \
    > "$work/14.exec.out" 2> "$work/14.exec.err"
  exec_status=$?
  if [ "$shell_status" -eq 0 ] || [ "$shell_status" -eq 124 ] || [ -s "$work/14.shell.out" ]; then
    record FAIL 14 "a shell request and a non-git command are both refused" "the shell request gave exit $shell_status and $(wc -c < "$work/14.shell.out" | tr -d ' ') byte(s) of output"
  elif [ "$exec_status" -eq 0 ] || [ "$exec_status" -eq 124 ]; then
    record FAIL 14 "a shell request and a non-git command are both refused" "'id' exited $exec_status with: $(head -2 "$work/14.exec.out")"
  elif ! grep -qF "$BAD_COMMAND" "$work/14.exec.err"; then
    record FAIL 14 "a shell request and a non-git command are both refused" "wanted \"$BAD_COMMAND\" on stderr, got: $(tail -2 "$work/14.exec.err")"
  else
    record PASS 14 "a shell request and a non-git command are both refused" "shell exit $shell_status, 'id' exit $exec_status with the refusal on stderr"
  fi
fi

# 15
if require_daemon 15 "a restart presents the same host key"; then
  before_fp=$(host_fingerprint)
  stop_daemon
  if ! start_daemon "$host_key" "$work/daemon-restart.log"; then
    record FAIL 15 "a restart presents the same host key" "the daemon did not come back: $(tail -5 "$work/daemon-restart.log")"
    daemon_ok=0
  else
    after_fp=$(host_fingerprint)
    file_fp=$(ssh-keygen -lf "$host_key" 2>/dev/null | awk '{print $2}')
    if [ -z "$before_fp" ] || [ -z "$after_fp" ]; then
      record FAIL 15 "a restart presents the same host key" "ssh-keyscan read '${before_fp:-nothing}' then '${after_fp:-nothing}'"
    elif [ "$before_fp" = "$after_fp" ] && [ "$after_fp" = "$file_fp" ]; then
      record PASS 15 "a restart presents the same host key" "$after_fp"
    else
      record FAIL 15 "a restart presents the same host key" "was $before_fp, now $after_fp, file says ${file_fp:-unreadable}"
    fi
  fi
fi

stop_daemon
unset GIT_SSH_COMMAND

# 16
if require_build 16 "a host key looser than 0600 stops startup, naming the mode" && require_scratch 16 "a host key looser than 0600 stops startup, naming the mode"; then
  loose_key="$work/loose_host_key"
  cp "$host_key" "$loose_key"
  chmod 644 "$loose_key"
  loose_port=$(free_port)
  DATABASE_URL="$scratch_url" CARN_REPO_ROOT="$repo_root" \
    CARN_SSH_HOST_KEY="$loose_key" CARN_SSH_HOST=127.0.0.1 \
    CARN_SSH_PORT="$(free_port)" HOST=127.0.0.1 PORT="$loose_port" \
    node dist/src/index.js > "$work/16" 2>&1 &
  daemon_pid=$!
  waited=0
  while kill -0 "$daemon_pid" 2>/dev/null && [ "$waited" -lt 40 ]; do
    sleep 0.5
    waited=$((waited + 1))
  done
  if kill -0 "$daemon_pid" 2>/dev/null; then
    stop_daemon
    record FAIL 16 "a host key looser than 0600 stops startup, naming the mode" "the daemon was still running after ${waited}s"
  else
    wait "$daemon_pid" 2>/dev/null
    loose_status=$?
    daemon_pid=""
    if [ "$loose_status" -eq 0 ]; then
      record FAIL 16 "a host key looser than 0600 stops startup, naming the mode" "the daemon exited 0"
    elif grep -qF "mode 0644" "$work/16"; then
      record PASS 16 "a host key looser than 0600 stops startup, naming the mode" "exit $loose_status, $(grep -F "mode 0644" "$work/16" | head -1 | sed 's/^[[:space:]]*//')"
    else
      record FAIL 16 "a host key looser than 0600 stops startup, naming the mode" "no mention of mode 0644: $(tail -3 "$work/16")"
    fi
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
  if (over.length) { console.error("outside 1a plus ssh2 and the four 1d adds: " + over.join(", ")); process.exit(1) }
  for (const name of ["ssh2", "@types/ssh2"]) {
    const field = name.startsWith("@types/") ? "devDependencies" : "dependencies"
    if (!pkg[field]?.[name]) { console.error(`${name} is not in ${field}`); process.exit(1) }
  }
' > "$work/19" 2>&1; then
  record PASS 19 "dependencies are 1a's plus ssh2, @types/ssh2, and 1d's four"
else
  record FAIL 19 "dependencies are 1a's plus ssh2, @types/ssh2, and 1d's four" "$(cat "$work/19")"
fi

# 20
# the files open with an SPDX comment, so BEGIN; is the first statement
find prisma/migrations -name 'migration.sql' 2>/dev/null | sort > "$work/20.list"
migration_count=$(grep -c . "$work/20.list")
unwrapped=""
while IFS= read -r file; do
  [ -n "$file" ] || continue
  opens=$(grep -vE '^[[:space:]]*(--.*)?$' "$file" | head -1)
  closes=$(grep -vE '^[[:space:]]*$' "$file" | tail -1)
  [ "$opens" = "BEGIN;" ] || unwrapped="$unwrapped $file opens '$opens';"
  [ "$closes" = "COMMIT;" ] || unwrapped="$unwrapped $file closes '$closes';"
done < "$work/20.list"
if [ "$migration_count" -eq 0 ]; then
  record FAIL 20 "every migration is wrapped in BEGIN and COMMIT" "no migration SQL found"
elif [ -n "$unwrapped" ]; then
  record FAIL 20 "every migration is wrapped in BEGIN and COMMIT" "$unwrapped"
else
  record PASS 20 "every migration is wrapped in BEGIN and COMMIT" "$migration_count file(s) checked"
fi

# 21
# a zero-match glob exits 0, so the file list is built before linting
sql=()
while IFS= read -r file; do
  sql+=("$file")
done < <(find prisma/migrations -name '*.sql' 2>/dev/null | sort)
if [ "${#sql[@]}" -eq 0 ]; then
  record FAIL 21 "squawk finds no issues in the migrations" "no migration SQL found to lint"
elif npx squawk "${sql[@]}" > "$work/21" 2>&1; then
  record PASS 21 "squawk finds no issues in the migrations" "${#sql[@]} file(s) linted"
else
  record FAIL 21 "squawk finds no issues in the migrations" "$(tail -10 "$work/21")"
fi

# 22
# after every daemon is down: 1a's check 9 needs port 3000 and rebuilds dist
if require_db 22 "verify-phase-1a.sh still passes in full"; then
  ./scripts/verify-phase-1a.sh > "$work/22" 2>&1
  phase_1a_status=$?
  if [ "$phase_1a_status" -eq 0 ]; then
    record PASS 22 "verify-phase-1a.sh still passes in full" "$(tail -1 "$work/22")"
  else
    record FAIL 22 "verify-phase-1a.sh still passes in full" "$(grep '^FAIL' "$work/22" | head -5)
$(tail -1 "$work/22")"
  fi
fi

# 23
drop_scratch
rm -rf "$repo_root"
if require_db 23 "the run leaves no scratch database, rows, or repos behind"; then
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
    record PASS 23 "the run leaves no scratch database, rows, or repos behind" "development database still $dev_rows repos:ssh_keys"
  else
    record FAIL 23 "the run leaves no scratch database, rows, or repos behind" "$left"
  fi
fi

ran=$(grep -c . "$log")
fails=$(grep -c '^FAIL ' "$log")

echo
if [ "$fails" -eq 0 ] && [ "$ran" -eq "$EXPECTED_CHECKS" ]; then
  echo "Phase 1b: $ran of $EXPECTED_CHECKS checks passed."
  exit 0
fi
echo "Phase 1b: $fails failing, $ran of $EXPECTED_CHECKS checks ran."
exit 1

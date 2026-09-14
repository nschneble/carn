#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

# Phase 1f exit checks, from docs/phases/1f-rename.md.
# Prints PASS or FAIL for each of the 14 checks and exits non-zero if any
# fail. Reads DATABASE_URL from the environment, falling back to ./.env.
# Check 13 re-runs 1e, which runs its own predecessor and so on down the
# chain, so a full run takes several minutes.

if [ -z "${BASH_VERSION:-}" ]; then
  echo "This script needs bash. Run ./scripts/verify/phase-1f.sh or bash scripts/verify/phase-1f.sh" >&2
  exit 1
fi

case "${SHELLOPTS:-}" in
  *posix*)
    echo "This script needs bash outside POSIX mode, which drops process substitution." >&2
    echo "Run ./scripts/verify/phase-1f.sh rather than sh scripts/verify/phase-1f.sh" >&2
    exit 1
    ;;
esac

# not set -e: this runs commands expected to fail and reads their status
set -uo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root" || exit 1

readonly EXPECTED_CHECKS=14
readonly REPO_NAME=verify1f
readonly MOVED_NAME=verify1f-moved
readonly ADMIN_NAME=verify1f-admin
readonly CASED_NAME=VERIFY1F-ADMIN
readonly SUFFIX_NAME=verify1f-suffix
readonly DOUBLE_NAME=verify1f-double
readonly OTHER_NAME=verify1f-other
readonly RACE_NAME=verify1f-race
readonly OTHER_HANDLE=verify1f-collaborator
readonly DEFAULT_ROOT=./local/repos
readonly NAME_CAP=40
readonly SSH_FLAGS="-o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=5"

# the seven refusals this phase reads off a real channel, verbatim
readonly BAD_NAME="That's not a valid repo name. Names are up to $NAME_CAP characters, starting with a letter or number, and containing only letters, numbers, dots, dashes, and underscores."
readonly NO_REPO="There's no repo named $REPO_NAME. Push to create it."
readonly NO_ADMIN="You don't have admin access to $MOVED_NAME. Ask the owner for an admin grant."
readonly NAME_TAKEN="There's already a repo named $OTHER_NAME. Pick another name."
readonly RACE_TAKEN="There's already a repo named $RACE_NAME. Pick another name."
readonly UNAVAILABLE="That request failed on the server. Try again shortly."
# no closing period: the contract test carries this as a regex body, which
# stops at "runs", and the loosest form that discriminates is the one to use
readonly NEW_BAD_COMMAND="That's not a command this server runs"

# the sentence badCommand used to carry. it stopped being true the moment a
# second command family landed, and the loosest form that still
# discriminates is its first sentence. assembled from parts, so the script
# doing the search is never itself one of the hits
readonly OLD_BAD_COMMAND=$(printf 'This server runs %s and %s only.' \
  "git-upload-pack" "git-receive-pack")

work=$(mktemp -d) || work=""
if [ -z "$work" ]; then
  echo "phase-1f: gave no temp directory" >&2
  exit 1
fi
readonly work
readonly log="$work/results"
readonly repo_root="$work/repos"
readonly host_key="$work/ssh_host_ed25519_key"
readonly seed="$work/seed"
: > "$log"

# a hermetic client: the developer's protocol.version or insteadOf would
# otherwise decide what the seeding pushes actually send
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_GLOBAL="$work/gitconfig"
printf '[user]\n\tname = Carn Verify\n\temail = verify@carn.invalid\n[commit]\n\tgpgsign = false\n' \
  > "$GIT_CONFIG_GLOBAL"

daemon_pid=""
holder_pid=""
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
    record FAIL "$1" "$2" "DATABASE_URL isn't set. Copy .env.example to .env, or export it."
    return 1
  fi
  return 0
}

# the cascade is one link per script: each proves its predecessor, which
# proved its own. a failing child's own failures are reproduced here, and
# record() indents them one level, so a break in 1a is still readable from 1f
cascade() {
  local number=$1
  local prior=$2
  local title=$3
  local out="$work/$number.$prior"
  local status
  local stack
  local last

  "./scripts/verify/phase-$prior.sh" > "$out" 2>&1
  status=$?

  if [ "$status" -eq 0 ]; then
    record PASS "$number" "$title" "$(tail -1 "$out")"
    return 0
  fi

  stack=$(awk '/^FAIL/ { inside = 1; print; next }
/^[[:space:]]/ { if (inside) print; next }
{ inside = 0 }' "$out")
  last=$(tail -1 "$out")

  # a predecessor that died early has a tail line but no stack to head it
  if [ -n "$stack" ]; then
    record FAIL "$number" "$title" "$stack
$last"
  else
    record FAIL "$number" "$title" "$last"
  fi

  return 1
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
    record FAIL "$1" "$2" "the daemon isn't running, see check 2"
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

require_renamed() {
  if [ "$renamed_ok" != 1 ]; then
    record FAIL "$1" "$2" "the owner's rename did not land, see check 2"
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

# the rename reaches the same exec handler git does, as a plain command.
# stdout and stderr land in separate files so a refusal can never be read
# off the stream the confirmation writes to
run_carn() {
  local key=$1 out=$2
  shift 2
  bounded 60 ssh -n $SSH_FLAGS -i "$key" -p "$ssh_port" git@127.0.0.1 "$@" \
    > "$out.out" 2> "$out.err"
}

rename_as() {
  local key=$1 out=$2 from=$3 to=$4
  run_carn "$key" "$out" carn repo rename "$from" "$to"
}

name_of() {
  psql_scratch -c "select name from repos where id = '$1'"
}

# a count off the scratch database, polled until it reads anything but 0
poll_count() {
  local sql=$1
  local waited=0
  while [ "$waited" -lt 60 ]; do
    case "$(psql_scratch -c "$sql")" in
      "" | 0) ;;
      *) return 0 ;;
    esac
    sleep 0.25
    waited=$((waited + 1))
  done
  return 1
}

# the holder takes a name in a transaction it never commits. READ
# COMMITTED hides the row, so the pre-check passes and the write then
# blocks inside the index until release_name commits - the race the
# pre-check cannot close, made deterministic
hold_name() {
  local fifo="$work/holder.fifo"
  rm -f "$fifo"
  mkfifo "$fifo" || return 1
  psql "$scratch_url" --no-psqlrc -q < "$fifo" > "$work/holder.log" 2>&1 &
  holder_pid=$!
  # read-write so the open can't block on a psql that never started
  exec 9<> "$fifo"
  printf "BEGIN;\nUPDATE repos SET name = '%s' WHERE id = '%s';\n" \
    "$1" "$other_id" >&9
  poll_count "select count(*) from pg_stat_activity where datname = '$scratch_db' and state = 'idle in transaction'"
}

# the daemon is in the index waiting on the holder's transaction id, which
# is what says it got past the pre-check rather than refusing on it
blocked_on_lock() {
  poll_count "select count(*) from pg_stat_activity where datname = '$scratch_db' and wait_event_type = 'Lock' and query ilike '%repos%'"
}

release_name() {
  printf 'COMMIT;\n' >&9
  exec 9>&-
  wait "$holder_pid" 2>/dev/null
  holder_pid=""
}

restore_other() {
  psql_scratch -c "update repos set name = '$OTHER_NAME' where id = '$other_id'" \
    > "$work/6.restore" 2>&1
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

# a page fetch that keeps the path exactly as written and never follows a
# redirect, so the 301 itself is what the status reports
fetch_page() {
  curl -sS --path-as-is --max-time 60 -D "$2.head" -o "$2.body" -w '%{http_code}' \
    "$(page_url "$1")" 2>"$2.err"
}

location_of() {
  grep -i '^location:' "$1.head" | sed 's/^[^:]*: *//' | tr -d '\r'
}

# every bare repo on disk, in a stable order: the path derives from the
# primary key, so a rename must leave this string untouched
disk_paths() {
  find "$repo_root" -mindepth 2 -maxdepth 2 -name '*.git' 2>/dev/null | sort
}

start_daemon() {
  ssh_port=$(free_port)
  http_port=$(free_port)
  [ -n "$ssh_port" ] && [ -n "$http_port" ] || return 1
  DATABASE_URL="$scratch_url" CARN_REPO_ROOT="$repo_root" \
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
renamed_ok=0
repo_id=""
other_id=""
other_user_id=""
paths_before=""

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

build_seed() {
  local name
  for name in "$REPO_NAME" "$OTHER_NAME"; do
    mkdir -p "$seed/$name" || return 1
    printf '# %s\n\nSeeded for phase 1f.\n' "$name" > "$seed/$name/README.md"
    git -C "$seed/$name" init -q -b main > /dev/null 2>&1 || return 1
    git -C "$seed/$name" add README.md > /dev/null 2>&1 || return 1
    git -C "$seed/$name" commit -q -m "Lay it down" > /dev/null 2>&1 || return 1
  done
  mkdir -p "$repo_root" || return 1
  return 0
}

echo "Phase 1f exit checks"
echo

# taken before any work, so check 14 can prove the run added nothing
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
other_key="$work/other_key"
for key in "$admin_key" "$other_key"; do
  ssh-keygen -t ed25519 -N '' -C "$(basename "$key")@carn.invalid" -f "$key" -q < /dev/null > /dev/null 2>&1
done

seed_built=0
build_seed && seed_built=1

# ---------------------------------------------------------------------------
# 2
readonly TITLE_2="the owner renames over ssh and the repo answers at the new name"
if require_db 2 "$TITLE_2" && require_build 2 "$TITLE_2" && require_scratch 2 "$TITLE_2"; then
  if [ "$seed_built" != 1 ]; then
    record FAIL 2 "$TITLE_2" "the seed work trees could not be built"
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
      for name in "$REPO_NAME" "$OTHER_NAME"; do
        as_user "$admin_key" git -C "$seed/$name" push "$(ssh_url "$name")" \
          main:refs/heads/main > "$work/2.push.$name" 2>&1 && pushed=$((pushed + 1))
      done
      if [ "$pushed" != "2" ]; then
        record FAIL 2 "$TITLE_2" "only $pushed of 2 seed pushes landed: $(tail -5 "$work/2.push.$REPO_NAME" "$work/2.push.$OTHER_NAME")"
      else
        seed_ok=1
        repo_id=$(psql_scratch -c "select id from repos where name = '$REPO_NAME'")
        other_id=$(psql_scratch -c "select id from repos where name = '$OTHER_NAME'")
        paths_before=$(disk_paths)
        head_before=$(git --git-dir="$repo_root/${repo_id:0:2}/$repo_id.git" rev-parse refs/heads/main 2>/dev/null)

        rename_as "$admin_key" "$work/2.rename" "$REPO_NAME" "$MOVED_NAME"
        rename_status=$?
        moved_status=$(fetch_page "/r/$MOVED_NAME" "$work/2.moved")
        gone_status=$(fetch_page "/r/$REPO_NAME" "$work/2.gone")
        now_named=$(name_of "$repo_id")
        rows=$(psql_scratch -c "select count(*) from repos")

        wrong=""
        [ "$rename_status" -eq 0 ] \
          || wrong="$wrong the rename exited $rename_status: $(tail -2 "$work/2.rename.err");"
        grep -qF "Renamed $REPO_NAME to $MOVED_NAME." "$work/2.rename.out" \
          || wrong="$wrong the channel said '$(tr -d '\n' < "$work/2.rename.out")', not the confirmation;"
        [ -s "$work/2.rename.err" ] && wrong="$wrong a successful rename wrote to stderr;"
        [ "$now_named" = "$MOVED_NAME" ] \
          || wrong="$wrong the row is named '${now_named:-gone}', wanted $MOVED_NAME;"
        [ "$rows" = "2" ] || wrong="$wrong repos holds $rows row(s), wanted 2;"
        [ "$moved_status" = "200" ] || wrong="$wrong /r/$MOVED_NAME answered $moved_status;"
        [ "$gone_status" = "404" ] || wrong="$wrong /r/$REPO_NAME answered $gone_status, wanted 404;"

        if [ -n "$wrong" ]; then
          record FAIL 2 "$TITLE_2" "$wrong"
        else
          renamed_ok=1
          record PASS 2 "$TITLE_2" "one UPDATE on $repo_id, 200 at the new name and 404 at the old"
        fi
      fi
    fi
  fi
fi

# 3
# the whole reason this bullet is one statement and not a migration: the
# path derives from the primary key, so the rename cannot have moved it
readonly TITLE_3="the on-disk path is byte-identical before and after"
if require_seed 3 "$TITLE_3" && require_renamed 3 "$TITLE_3"; then
  paths_after=$(disk_paths)
  head_after=$(git --git-dir="$repo_root/${repo_id:0:2}/$repo_id.git" rev-parse refs/heads/main 2>/dev/null)
  wrong=""
  [ -n "$paths_before" ] || wrong="$wrong no repo path was captured before the rename;"
  [ "$paths_before" = "$paths_after" ] \
    || wrong="$wrong the tree changed:$(diff <(printf '%s\n' "$paths_before") <(printf '%s\n' "$paths_after") | tr '\n' ' ');"
  [ -n "$head_before" ] && [ "$head_before" = "$head_after" ] \
    || wrong="$wrong refs/heads/main went '${head_before:-unreadable}' to '${head_after:-unreadable}';"
  if [ -n "$wrong" ]; then
    record FAIL 3 "$TITLE_3" "$wrong"
  else
    record PASS 3 "$TITLE_3" "${repo_id:0:2}/$repo_id.git, unmoved, still at $head_after"
  fi
fi

# 4
readonly TITLE_4="a clone works at the new name and the old name is gone"
if require_renamed 4 "$TITLE_4"; then
  as_user "$admin_key" git clone -q "$(ssh_url "$MOVED_NAME")" "$work/clone-new" \
    > "$work/4.new" 2>&1
  new_status=$?
  as_user "$admin_key" git clone -q "$(ssh_url "$REPO_NAME")" "$work/clone-old" \
    > "$work/4.old" 2>&1
  old_status=$?
  wrong=""
  [ "$new_status" -eq 0 ] \
    || wrong="$wrong the clone at $MOVED_NAME exited $new_status: $(tail -3 "$work/4.new");"
  diff -q "$seed/$REPO_NAME/README.md" "$work/clone-new/README.md" > /dev/null 2>&1 \
    || wrong="$wrong the clone at $MOVED_NAME doesn't carry the pushed README.md;"
  [ "$old_status" -ne 0 ] || wrong="$wrong the clone at the retired name succeeded;"
  grep -qF "$NO_REPO" "$work/4.old" \
    || wrong="$wrong the retired name drew '$(tail -2 "$work/4.old" | head -1)', wanted the noRepo sentence;"
  [ -e "$work/clone-old" ] && wrong="$wrong the refused clone left a directory behind;"
  if [ -n "$wrong" ]; then
    record FAIL 4 "$TITLE_4" "$wrong"
  else
    record PASS 4 "$TITLE_4" "cloned at $MOVED_NAME, refused at $REPO_NAME with noRepo"
  fi
fi

# 5
# a collaborator who can push shouldn't be able to change the public url
# out from under every link to it, so write is refused and admin isn't
readonly TITLE_5="a write grant pushes but cannot rename, and an admin grant can"
if require_renamed 5 "$TITLE_5"; then
  other_fp=$(ssh-keygen -lf "$other_key.pub" | awk '{print $2}')
  other_pub=$(awk '{print $1 " " $2}' "$other_key.pub")
  psql -v ON_ERROR_STOP=1 "$scratch_url" --no-psqlrc -q -c "
    INSERT INTO users (id, handle, display_name, email, is_admin)
      VALUES (gen_random_uuid(), '$OTHER_HANDLE', 'Verify Collaborator',
              'collaborator@carn.invalid', false);
    INSERT INTO ssh_keys (id, user_id, name, public_key, fingerprint)
      VALUES (gen_random_uuid(), (SELECT id FROM users WHERE handle = '$OTHER_HANDLE'),
              '$OTHER_HANDLE', '$other_pub', '$other_fp');
    INSERT INTO repo_grants (repo_id, user_id, level)
      VALUES ('$repo_id', (SELECT id FROM users WHERE handle = '$OTHER_HANDLE'), 'write');" \
    > "$work/5.setup" 2>&1
  fixture_status=$?
  other_user_id=$(psql_scratch -c "select id from users where handle = '$OTHER_HANDLE'")

  rename_as "$other_key" "$work/5.write" "$MOVED_NAME" "$ADMIN_NAME"
  write_status=$?
  after_write=$(name_of "$repo_id")

  # the same grant that cannot rename still has to push, or writeLevels
  # could be adminLevels and nothing here would notice
  printf 'Pushed by the write grant.\n' >> "$seed/$REPO_NAME/README.md"
  git -C "$seed/$REPO_NAME" commit -q -am "Write from the collaborator" \
    > "$work/5.commit" 2>&1
  commit_status=$?
  as_user "$other_key" git -C "$seed/$REPO_NAME" push "$(ssh_url "$MOVED_NAME")" \
    main:refs/heads/main > "$work/5.push" 2>&1
  push_status=$?

  psql_scratch -c "update repo_grants set level = 'admin' where repo_id = '$repo_id' and user_id = '$other_user_id'" \
    > "$work/5.grant" 2>&1
  grant_status=$?

  rename_as "$other_key" "$work/5.admin" "$MOVED_NAME" "$ADMIN_NAME"
  admin_status=$?
  after_admin=$(name_of "$repo_id")

  wrong=""
  [ "$fixture_status" -eq 0 ] \
    || wrong="$wrong the collaborator did not insert: $(tail -3 "$work/5.setup");"
  [ "$grant_status" -eq 0 ] || wrong="$wrong the grant did not move to admin: $(tail -2 "$work/5.grant");"
  [ "$write_status" -ne 0 ] || wrong="$wrong the write grant renamed the repo;"
  grep -qF "$NO_ADMIN" "$work/5.write.err" \
    || wrong="$wrong the write grant drew '$(tail -1 "$work/5.write.err")', wanted the noAdmin sentence;"
  [ "$commit_status" -eq 0 ] \
    || wrong="$wrong the collaborator's commit failed: $(tail -2 "$work/5.commit");"
  [ "$push_status" -eq 0 ] \
    || wrong="$wrong the write grant could not push: $(tail -3 "$work/5.push");"
  [ "$after_write" = "$MOVED_NAME" ] \
    || wrong="$wrong the refused rename moved the name to '${after_write:-gone}';"
  [ "$admin_status" -eq 0 ] \
    || wrong="$wrong the admin grant exited $admin_status: $(tail -2 "$work/5.admin.err");"
  [ "$after_admin" = "$ADMIN_NAME" ] \
    || wrong="$wrong the admin grant left the name at '${after_admin:-gone}';"
  if [ -n "$wrong" ]; then
    record FAIL 5 "$TITLE_5" "$wrong"
  else
    record PASS 5 "$TITLE_5" "write pushed and was refused by sentence, admin renamed to $ADMIN_NAME"
  fi
fi

# 6
# the unique index is on lower(name), so the upper-case spelling of a taken
# name has to be refused too, and neither refusal may carry driver text.
# the pre-check answers both of those without a write. the two legs after
# them are the window it cannot cover, where the index is what finds the
# collision: a name that goes from free to taken after the check and before
# the write, once on a rename's UPDATE and once on a create's INSERT
readonly TITLE_6="a taken name is refused with a sentence, not a driver error"
if require_renamed 6 "$TITLE_6"; then
  rename_as "$admin_key" "$work/6.same" "$ADMIN_NAME" "$OTHER_NAME"
  same_status=$?
  rename_as "$admin_key" "$work/6.cased" "$ADMIN_NAME" "VERIFY1F-OTHER"
  cased_status=$?
  after_taken=$(name_of "$repo_id")

  wrong=""
  [ "$same_status" -ne 0 ] || wrong="$wrong renaming onto $OTHER_NAME succeeded;"
  [ "$cased_status" -ne 0 ] || wrong="$wrong renaming onto VERIFY1F-OTHER succeeded;"
  for out in "$work/6.same.err" "$work/6.cased.err"; do
    grep -qF "$NAME_TAKEN" "$out" \
      || wrong="$wrong $(basename "$out") holds '$(tail -1 "$out")', wanted the nameTaken sentence;"
  done
  [ "$after_taken" = "$ADMIN_NAME" ] \
    || wrong="$wrong the refused rename moved the name to '${after_taken:-gone}';"

  # the writers run with fd 9 closed: the holder reads EOF off the last
  # write end, and an ssh child holding one would hang release_name
  race_engaged=0
  race_status=0
  if ! hold_name "$RACE_NAME"; then
    wrong="$wrong the holder never took $RACE_NAME: $(tail -2 "$work/holder.log");"
  else
    rename_as "$admin_key" "$work/6.race" "$ADMIN_NAME" "$RACE_NAME" 9>&- &
    race_pid=$!
    blocked_on_lock && race_engaged=1
    release_name
    wait "$race_pid"
    race_status=$?
    restore_other

    [ "$race_engaged" = "1" ] \
      || wrong="$wrong the racing rename never waited on the index, so it refused on the pre-check;"
    [ "$race_status" -ne 0 ] || wrong="$wrong the racing rename succeeded;"
    grep -qF "$RACE_TAKEN" "$work/6.race.err" \
      || wrong="$wrong the racing rename drew '$(tail -1 "$work/6.race.err")', wanted the nameTaken sentence;"
  fi

  push_engaged=0
  push_status=0
  if ! hold_name "$RACE_NAME"; then
    wrong="$wrong the holder never re-took $RACE_NAME: $(tail -2 "$work/holder.log");"
  else
    as_user "$admin_key" git -C "$seed/$REPO_NAME" push "$(ssh_url "$RACE_NAME")" \
      main:refs/heads/main > "$work/6.push" 2>&1 9>&- &
    push_pid=$!
    blocked_on_lock && push_engaged=1
    release_name
    wait "$push_pid"
    push_status=$?
    restore_other

    [ "$push_engaged" = "1" ] \
      || wrong="$wrong the racing push never waited on the index, so it refused on the pre-check;"
    [ "$push_status" -ne 0 ] || wrong="$wrong the racing push created the repo;"
    grep -qF "$RACE_TAKEN" "$work/6.push" \
      || wrong="$wrong the racing push drew '$(tail -2 "$work/6.push" | head -1)', wanted the nameTaken sentence;"
  fi

  # what the race legs are for: the write's own refusal reads like the
  # pre-check's, rather than as the driver error or the generic failure
  for out in "$work/6.same.err" "$work/6.cased.err" "$work/6.race.err" "$work/6.push"; do
    [ -f "$out" ] || continue
    grep -qiE 'prisma|P2002|23505|duplicate key|constraint|postgres|at async|at Object' "$out" \
      && wrong="$wrong $(basename "$out") leaked driver text: $(tail -1 "$out");"
    grep -qF "$UNAVAILABLE" "$out" \
      && wrong="$wrong $(basename "$out") fell through to the generic failure;"
  done

  after_race=$(name_of "$repo_id")
  other_still=$(name_of "$other_id")
  rows=$(psql_scratch -c "select count(*) from repos")
  paths_now=$(disk_paths)
  [ "$after_race" = "$ADMIN_NAME" ] \
    || wrong="$wrong a refused rename moved the name to '${after_race:-gone}';"
  [ "$other_still" = "$OTHER_NAME" ] \
    || wrong="$wrong the repo holding the name is now '${other_still:-gone}';"
  [ "$rows" = "2" ] || wrong="$wrong repos holds $rows row(s), wanted 2;"
  [ "$paths_now" = "$paths_before" ] \
    || wrong="$wrong the losing push left a repo on disk:$(diff <(printf '%s\n' "$paths_before") <(printf '%s\n' "$paths_now") | tr '\n' ' ');"

  if [ -n "$wrong" ]; then
    record FAIL 6 "$TITLE_6" "$wrong"
  else
    record PASS 6 "$TITLE_6" "both spellings refused on the pre-check, a rename and a push refused by the index, all four by sentence"
  fi
fi

# 7
# lower(name) is what the index reads, so one row changing its own case
# collides with nothing and is still one plain UPDATE
readonly TITLE_7="a case change of the same row succeeds"
if require_renamed 7 "$TITLE_7"; then
  rename_as "$admin_key" "$work/7.case" "$ADMIN_NAME" "$CASED_NAME"
  case_status=$?
  after_case=$(name_of "$repo_id")
  rows=$(psql_scratch -c "select count(*) from repos")
  cased_page=$(fetch_page "/r/$CASED_NAME" "$work/7.page")

  wrong=""
  [ "$case_status" -eq 0 ] \
    || wrong="$wrong the case change exited $case_status: $(tail -2 "$work/7.case.err");"
  [ "$after_case" = "$CASED_NAME" ] \
    || wrong="$wrong the row is named '${after_case:-gone}', wanted $CASED_NAME;"
  [ "$rows" = "2" ] || wrong="$wrong repos holds $rows row(s), wanted 2;"
  [ "$cased_page" = "200" ] || wrong="$wrong /r/$CASED_NAME answered $cased_page;"
  if [ -n "$wrong" ]; then
    record FAIL 7 "$TITLE_7" "$wrong"
  else
    record PASS 7 "$TITLE_7" "$ADMIN_NAME to $CASED_NAME on the same row, still $rows rows"
  fi
fi

# 8
readonly TITLE_8="an invalid new name draws the badName refusal verbatim, and a name at the cap is accepted"
if require_renamed 8 "$TITLE_8"; then
  long_name=$(printf 'a%.0s' $(seq $((NAME_CAP + 1))))
  bad=""
  for name in '-nope' '.hidden' '../etc' "$long_name"; do
    rename_as "$admin_key" "$work/8" "$CASED_NAME" "$name"
    bad_status=$?
    if [ "$bad_status" -eq 0 ]; then
      bad="$bad '$name' was accepted;"
    elif ! grep -qF "$BAD_NAME" "$work/8.err"; then
      bad="$bad '$name' drew '$(tail -1 "$work/8.err")';"
    fi
  done

  # one under the refused length: a cap only ever tested from above could
  # be off by one in the accepting direction and nothing would say so
  cap_name=$(printf 'a%.0s' $(seq $NAME_CAP))
  rename_as "$admin_key" "$work/8.cap" "$CASED_NAME" "$cap_name"
  cap_status=$?
  at_cap=$(name_of "$repo_id")
  rename_as "$admin_key" "$work/8.back" "$cap_name" "$CASED_NAME"
  back_status=$?

  [ "$cap_status" -eq 0 ] \
    || bad="$bad a $NAME_CAP-character name was refused: $(tail -1 "$work/8.cap.err");"
  [ "$at_cap" = "$cap_name" ] \
    || bad="$bad the $NAME_CAP-character name stored as '${at_cap:-gone}';"
  [ "$back_status" -eq 0 ] \
    || bad="$bad the row would not go back to $CASED_NAME: $(tail -1 "$work/8.back.err");"

  after_bad=$(name_of "$repo_id")
  rows=$(psql_scratch -c "select count(*) from repos")
  if [ -n "$bad" ]; then
    record FAIL 8 "$TITLE_8" "$bad"
  elif [ "$after_bad" != "$CASED_NAME" ] || [ "$rows" != "2" ]; then
    record FAIL 8 "$TITLE_8" "the row is named '${after_bad:-gone}' and repos holds $rows row(s)"
  else
    record PASS 8 "$TITLE_8" "4 names refused verbatim, $NAME_CAP characters accepted, the row still $CASED_NAME"
  fi
fi

# 9
# a ref nothing could resolve redirects identically, which is what proves
# the answer comes off the url rather than a lookup of the default branch
readonly TITLE_9="a bare tree ref is a 301 to the repo page, for every ref"
if require_seed 9 "$TITLE_9"; then
  main_status=$(fetch_page "/r/$OTHER_NAME/tree/main/" "$work/9.main")
  tag_status=$(fetch_page "/r/$OTHER_NAME/tree/v9.9.9/" "$work/9.tag")
  wrong=""
  [ "$main_status" = "301" ] || wrong="$wrong tree/main/ answered $main_status, wanted 301;"
  [ "$tag_status" = "301" ] || wrong="$wrong tree/v9.9.9/ answered $tag_status, wanted 301;"
  for page in "$work/9.main" "$work/9.tag"; do
    to=$(location_of "$page")
    [ "$to" = "/r/$OTHER_NAME" ] \
      || wrong="$wrong $(basename "$page") points at '${to:-nothing}', wanted /r/$OTHER_NAME;"
  done
  [ -s "$work/9.main.body" ] && wrong="$wrong the redirect carried a body;"
  if [ -n "$wrong" ]; then
    record FAIL 9 "$TITLE_9" "$wrong"
  else
    record PASS 9 "$TITLE_9" "main and an unresolvable tag both 301 to /r/$OTHER_NAME"
  fi
fi

# 10
# the wildcard route never sees this spelling, and it's the one a person
# types. ignoreTrailingSlash would have aliased every route in the app
readonly TITLE_10="the no-slash spelling answers the same 301, not a 404"
if require_seed 10 "$TITLE_10"; then
  bare_status=$(fetch_page "/r/$OTHER_NAME/tree/main" "$work/10.bare")
  bare_to=$(location_of "$work/10.bare")
  wrong=""
  [ "$bare_status" != "404" ] || wrong="$wrong tree/main answered 404, so it never reached a route;"
  [ "$bare_status" = "301" ] || wrong="$wrong tree/main answered $bare_status, wanted 301;"
  [ "$bare_to" = "/r/$OTHER_NAME" ] \
    || wrong="$wrong it points at '${bare_to:-nothing}', wanted /r/$OTHER_NAME;"
  # the global switch stays off: it would make /r/:repo/ and /r/:repo/commits/
  # second spellings of pages that have exactly one canonical url
  grep -qF 'ignoreTrailingSlash' src/app.ts \
    && wrong="$wrong src/app.ts sets ignoreTrailingSlash;"
  if [ -n "$wrong" ]; then
    record FAIL 10 "$TITLE_10" "$wrong"
  else
    record PASS 10 "$TITLE_10" "301 to /r/$OTHER_NAME with ignoreTrailingSlash still unset"
  fi
fi

# 11
# source only: docs/phases quotes the retired sentence as history, which is
# exactly what a phase brief is for
readonly TITLE_11="the retired badCommand sentence is gone and the new one is in all three files"
printf '%s\n' "$OLD_BAD_COMMAND" > "$work/11.control"
if ! grep -qF "$OLD_BAD_COMMAND" "$work/11.control"; then
  record FAIL 11 "$TITLE_11" "the pattern doesn't match a known hit; it cannot gate"
else
  stale=$(git grep --untracked -nF "$OLD_BAD_COMMAND" -- src test scripts)
  missing=""
  for site in src/ssh/exec.ts scripts/verify/phase-1b.sh test/contract/ssh-transport.contract.ts; do
    grep -qF "$NEW_BAD_COMMAND" "$site" || missing="$missing $site"
  done
  if [ -n "$stale" ]; then
    record FAIL 11 "$TITLE_11" "$stale"
  elif [ -n "$missing" ]; then
    record FAIL 11 "$TITLE_11" "the new sentence never reached:$missing"
  else
    record PASS 11 "$TITLE_11" "0 stale sites, 3 files carrying the replacement"
  fi
fi

# 12
# namePattern admits a leading slash and a trailing .git, both of which
# resolveRepo strips off every lookup, so a name stored with either could
# never be found again. the target is refused rather than rewritten, and
# .git.git is what tells a refusal from a single-pass strip
readonly TITLE_12="a target a lookup would rewrite is refused, not rewritten"
if require_renamed 12 "$TITLE_12"; then
  wrong=""
  for target in "$SUFFIX_NAME.git" "$DOUBLE_NAME.git.git" "/$SUFFIX_NAME"; do
    rename_as "$admin_key" "$work/12.reject" "$CASED_NAME" "$target"
    reject_status=$?
    [ "$reject_status" -ne 0 ] || wrong="$wrong '$target' was accepted;"
    grep -qF "$BAD_NAME" "$work/12.reject.err" \
      || wrong="$wrong '$target' drew '$(tail -1 "$work/12.reject.err")', wanted the badName sentence;"
    [ -s "$work/12.reject.out" ] \
      && wrong="$wrong '$target' wrote '$(tr -d '\n' < "$work/12.reject.out")' to stdout;"
  done
  after_reject=$(name_of "$repo_id")

  # the same name without the suffix, so what the three refusals prove is
  # the round-trip rule and not some property of the name itself
  rename_as "$admin_key" "$work/12.plain" "$CASED_NAME" "$SUFFIX_NAME"
  plain_status=$?
  after_plain=$(name_of "$repo_id")
  as_user "$admin_key" git clone -q "$(ssh_url "$SUFFIX_NAME")" "$work/clone-suffix" \
    > "$work/12.clone" 2>&1
  clone_status=$?
  rows=$(psql_scratch -c "select count(*) from repos")

  [ "$after_reject" = "$CASED_NAME" ] \
    || wrong="$wrong a refused target moved the name to '${after_reject:-gone}';"
  [ "$plain_status" -eq 0 ] \
    || wrong="$wrong the unsuffixed rename exited $plain_status: $(tail -2 "$work/12.plain.err");"
  grep -qFx "Renamed $CASED_NAME to $SUFFIX_NAME." "$work/12.plain.out" \
    || wrong="$wrong the channel said '$(tr -d '\n' < "$work/12.plain.out")', wanted the confirmation;"
  [ "$after_plain" = "$SUFFIX_NAME" ] \
    || wrong="$wrong the row is named '${after_plain:-gone}', wanted $SUFFIX_NAME;"
  [ "$clone_status" -eq 0 ] \
    || wrong="$wrong the clone at $SUFFIX_NAME exited $clone_status: $(tail -3 "$work/12.clone");"
  [ "$rows" = "2" ] || wrong="$wrong repos holds $rows row(s), wanted 2;"
  if [ -n "$wrong" ]; then
    record FAIL 12 "$TITLE_12" "$wrong"
  else
    record PASS 12 "$TITLE_12" "3 targets refused with the row untouched, the bare name accepted and cloned"
  fi
fi

stop_daemon
unset GIT_SSH_COMMAND

# torn down here, not at check 14: phase-1b.sh's own check 23 counts every
# carn_verify_% database, and would read this run's as a stray
drop_scratch
rm -rf "$repo_root"

# 13
# after the daemon is down and the scratch database is dropped. both reach
# here down the chain: 1a's check 9 needs port 3000, and 1b's check 23
# reads a live scratch as a stray
readonly TITLE_13="phase-1e.sh still passes in full"
if require_db 13 "$TITLE_13"; then
  cascade 13 1e "$TITLE_13"
fi

# 14
readonly TITLE_14="the run leaves no scratch database, rows, or repos behind"
if require_db 14 "$TITLE_14"; then
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
    record PASS 14 "$TITLE_14" "development database still $dev_rows repos:ssh_keys"
  else
    record FAIL 14 "$TITLE_14" "$left"
  fi
fi

ran=$(grep -c . "$log")
fails=$(grep -c '^FAIL ' "$log")

echo
if [ "$fails" -eq 0 ] && [ "$ran" -eq "$EXPECTED_CHECKS" ]; then
  echo "Phase 1f: $ran of $EXPECTED_CHECKS checks passed."
  exit 0
fi
echo "Phase 1f: $fails failing, $ran of $EXPECTED_CHECKS checks ran."
exit 1

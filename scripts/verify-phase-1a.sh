#!/usr/bin/env bash
#
# Phase 1a exit checks, from docs/phases/1a-foundation.md.
# Prints PASS or FAIL for each of the 17 checks and exits non-zero if any
# fail. Reads DATABASE_URL from the environment, falling back to ./.env.

# not set -e: this runs commands expected to fail and reads their status
set -uo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

readonly EXPECTED_CHECKS=17
readonly APP_PORT=3000
readonly CSP="default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
readonly TABLES="'users','ssh_keys','repos','repo_grants'"

work=$(mktemp -d) || work=""
if [ -z "$work" ]; then
  echo "verify-phase-1a: gave no temp directory" >&2
  exit 1
fi
readonly work
readonly log="$work/results"
: > "$log"

cleanup() {
  [ -n "${app_pid:-}" ] && kill "$app_pid" 2>/dev/null
  rm -rf "$work"
}
trap cleanup EXIT

# the verdict derives from this log, so a deleted FAIL trips the count
record() {
  printf '%s %s\n' "$1" "$2" >> "$log"
  printf '%-4s  %2d. %s\n' "$1" "$2" "$3"
  if [ -n "${4:-}" ]; then
    printf '%s\n' "$4" | sed 's/^/         /'
  fi
  return 0
}

psql_url() {
  psql "$DATABASE_URL" --no-psqlrc --quiet --tuples-only --no-align "$@"
}

require_db() {
  if [ -z "${DATABASE_URL:-}" ]; then
    record FAIL "$1" "$2" "DATABASE_URL is not set. Copy .env.example to .env, or export it."
    return 1
  fi
  return 0
}

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

echo "Phase 1a exit checks"
echo

# 1
if npm ci > "$work/1" 2>&1 && [ -d node_modules ]; then
  record PASS 1 "npm ci completes clean"
else
  record FAIL 1 "npm ci completes clean" "$(tail -5 "$work/1")"
fi

# 2
strict=$(sed -nE 's/.*"strict"[[:space:]]*:[[:space:]]*(true|false).*/\1/p' tsconfig.json)
if [ "$strict" != "true" ]; then
  record FAIL 2 "npm run build exits 0 under strict: true" "tsconfig.json strict is '${strict:-unset}', not true"
elif npm run build > "$work/2" 2>&1 && [ -f dist/src/index.js ] && [ -d dist/test ]; then
  record PASS 2 "npm run build exits 0 under strict: true"
else
  record FAIL 2 "npm run build exits 0 under strict: true" "$(tail -10 "$work/2")"
fi

# 3
if ! docker compose up -d > "$work/3" 2>&1; then
  record FAIL 3 "docker compose brings Postgres up healthy" "$(grep -v '^[[:space:]]*$' "$work/3" | head -3)"
else
  pg_cid=$(docker compose ps -q postgres 2>/dev/null)
  health=""
  waited=0
  while [ -n "$pg_cid" ] && [ "$waited" -lt 90 ]; do
    health=$(docker inspect -f '{{.State.Health.Status}}' "$pg_cid" 2>/dev/null)
    [ "$health" = "healthy" ] && break
    sleep 2
    waited=$((waited + 2))
  done
  if [ -z "$pg_cid" ]; then
    record FAIL 3 "docker compose brings Postgres up healthy" "compose started but named no postgres container"
  elif [ "$health" = "healthy" ]; then
    record PASS 3 "docker compose brings Postgres up healthy"
  else
    record FAIL 3 "docker compose brings Postgres up healthy" "container health is '${health:-unknown}' after ${waited}s"
  fi
fi

# 4
# deploy exits 0 on an already-migrated db, so assert empty beforehand
if require_db 4 "prisma migrate deploy applies to an empty database"; then
  existing=$(psql_url -c "select count(*) from information_schema.tables where table_schema='public'" 2>"$work/4.err")
  migrations=$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  if [ -z "$existing" ]; then
    record FAIL 4 "prisma migrate deploy applies to an empty database" "$(tail -3 "$work/4.err")"
  elif [ "$existing" != "0" ]; then
    record FAIL 4 "prisma migrate deploy applies to an empty database" \
      "public schema already holds $existing table(s). Recreate the database, or run: npx prisma migrate reset --force"
  elif ! npx prisma migrate deploy > "$work/4" 2>&1; then
    record FAIL 4 "prisma migrate deploy applies to an empty database" "$(tail -8 "$work/4")"
  else
    applied=$(psql_url -c "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null")
    if [ "$applied" = "$migrations" ]; then
      record PASS 4 "prisma migrate deploy applies to an empty database" "$applied of $migrations migrations applied"
    else
      record FAIL 4 "prisma migrate deploy applies to an empty database" "${applied:-0} of $migrations migrations recorded as applied"
    fi
  fi
fi

# 5
# the index and the CHECK are SQL prisma cannot express, so drift by design
if require_db 5 "prisma migrate diff reports no unexpected drift"; then
  npx prisma migrate diff --from-config-datasource \
    --to-schema prisma/schema.prisma --exit-code > "$work/5" 2>&1
  diff_status=$?
  if [ "$diff_status" -eq 0 ]; then
    record PASS 5 "prisma migrate diff reports no unexpected drift" "empty diff"
  elif [ "$diff_status" -eq 2 ]; then
    npx prisma migrate diff --from-config-datasource \
      --to-schema prisma/schema.prisma --script > "$work/5.sql" 2>&1
    unexpected=$(grep -v '^[[:space:]]*$' "$work/5.sql" \
      | grep -v '^[[:space:]]*--' \
      | grep -v -e repos_name_lower_key -e repos_name_format)
    if [ -z "$unexpected" ]; then
      record PASS 5 "prisma migrate diff reports no unexpected drift" \
        "drift is repos_name_lower_key and repos_name_format only, both intentional"
    else
      record FAIL 5 "prisma migrate diff reports no unexpected drift" "$unexpected"
    fi
  else
    record FAIL 5 "prisma migrate diff reports no unexpected drift" "$(tail -8 "$work/5")"
  fi
fi

# 6
if require_db 6 "exactly one user, handle nschneble, is_admin true"; then
  users=$(psql_url -c "select (select count(*) from users) || ':' || (select count(*) from users where handle='nschneble' and is_admin)" 2>&1)
  if [ "$users" = "1:1" ]; then
    record PASS 6 "exactly one user, handle nschneble, is_admin true"
  else
    record FAIL 6 "exactly one user, handle nschneble, is_admin true" "total:matching was '$users', wanted 1:1"
  fi
fi

# 7
if require_db 7 "inserting Foo then foo fails on repos_name_lower_key"; then
  owner="(select id from users where handle='nschneble')"
  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" --no-psqlrc -c \
    "INSERT INTO repos (id, owner_id, name) VALUES (gen_random_uuid(), $owner, 'Foo');
     INSERT INTO repos (id, owner_id, name) VALUES (gen_random_uuid(), $owner, 'foo');" \
    > "$work/7.out" 2> "$work/7.err"
  dup_status=$?
  if [ "$dup_status" -eq 0 ]; then
    record FAIL 7 "inserting Foo then foo fails on repos_name_lower_key" "both inserts succeeded; the index is on name, not lower(name)"
  elif ! grep -q 'INSERT 0 1' "$work/7.out"; then
    record FAIL 7 "inserting Foo then foo fails on repos_name_lower_key" "the first insert did not land: $(tail -2 "$work/7.err")"
  elif grep -q 'repos_name_lower_key' "$work/7.err"; then
    record PASS 7 "inserting Foo then foo fails on repos_name_lower_key"
  else
    record FAIL 7 "inserting Foo then foo fails on repos_name_lower_key" "$(tail -3 "$work/7.err")"
  fi
fi

# 8
if require_db 8 "inserting a repo named -bad fails on repos_name_format"; then
  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" --no-psqlrc -c \
    "INSERT INTO repos (id, owner_id, name) VALUES (gen_random_uuid(), (select id from users where handle='nschneble'), '-bad');" \
    > /dev/null 2> "$work/8.err"
  bad_status=$?
  if [ "$bad_status" -eq 0 ]; then
    record FAIL 8 "inserting a repo named -bad fails on repos_name_format" "the insert succeeded; the constraint is missing"
  elif grep -q 'repos_name_format' "$work/8.err"; then
    record PASS 8 "inserting a repo named -bad fails on repos_name_format"
  else
    record FAIL 8 "inserting a repo named -bad fails on repos_name_format" "$(tail -3 "$work/8.err")"
  fi
fi

# 9
if [ ! -f dist/src/index.js ]; then
  record FAIL 9 "/health returns 200 json with the security headers" "dist/src/index.js is missing; check 2 did not build"
elif ! require_db 9 "/health returns 200 json with the security headers"; then
  :
elif curl -s -o /dev/null --max-time 2 "http://localhost:$APP_PORT/health"; then
  record FAIL 9 "/health returns 200 json with the security headers" "port $APP_PORT is already serving; stop it and re-run"
else
  PORT=$APP_PORT HOST=127.0.0.1 node dist/src/index.js > "$work/9.log" 2>&1 &
  app_pid=$!
  waited=0
  while [ "$waited" -lt 20 ]; do
    curl -s -o /dev/null --max-time 1 "http://localhost:$APP_PORT/health" && break
    sleep 0.5
    waited=$((waited + 1))
  done
  curl -i -s --max-time 5 "http://localhost:$APP_PORT/health" > "$work/9" 2>&1
  kill "$app_pid" 2>/dev/null
  wait "$app_pid" 2>/dev/null
  app_pid=""

  header() {
    awk -v want="$1" '
      { line = $0; sub(/\r$/, "", line); colon = index(line, ":")
        if (colon > 0 && tolower(substr(line, 1, colon - 1)) == want) {
          value = substr(line, colon + 1); sub(/^ +/, "", value); print value; exit } }
    ' "$work/9"
  }
  missing=""
  grep -qi '^HTTP/1.1 200' "$work/9" || missing="$missing status is not 200;"
  [ "$(header content-type)" != "application/json; charset=utf-8" ] && missing="$missing content-type is '$(header content-type)';"
  [ "$(header content-security-policy)" != "$CSP" ] && missing="$missing content-security-policy differs;"
  [ "$(header x-content-type-options)" != "nosniff" ] && missing="$missing x-content-type-options is '$(header x-content-type-options)';"
  [ "$(header referrer-policy)" != "no-referrer" ] && missing="$missing referrer-policy is '$(header referrer-policy)';"
  if [ -z "$missing" ]; then
    record PASS 9 "/health returns 200 json with the security headers"
  else
    record FAIL 9 "/health returns 200 json with the security headers" "$missing"
  fi
fi

# 10
# a zero-match glob exits 0, so the pass count is the real assertion
if [ ! -d dist/test ]; then
  record FAIL 10 "node --test passes with a non-zero test count" "dist/test is missing; check 2 did not build"
else
  node --test --test-reporter=tap "dist/test/**/*.js" > "$work/10" 2>&1
  test_status=$?
  passed=$(sed -nE 's/^# pass ([0-9]+)$/\1/p' "$work/10" | tail -1)
  failed=$(sed -nE 's/^# fail ([0-9]+)$/\1/p' "$work/10" | tail -1)
  if [ "$test_status" -eq 0 ] && [ "${passed:-0}" -gt 0 ] && [ "${failed:-1}" -eq 0 ]; then
    record PASS 10 "node --test passes with a non-zero test count" "${passed} passing, ${failed} failing"
  else
    record FAIL 10 "node --test passes with a non-zero test count" "${passed:-0} passing, ${failed:-unknown} failing, exit $test_status"
  fi
fi

# 11
# a git pathspec * crosses /, so src/**/*.ts would skip src/config.ts
sources=$(git ls-files --cached --others --exclude-standard -- src test \
  | grep '\.ts$' | grep -v '^src/generated/')
source_count=$(printf '%s\n' "$sources" | grep -c . )
found_count=$(find src test -name '*.ts' -not -path 'src/generated/*' 2>/dev/null | wc -l | tr -d ' ')
unstamped=""
while IFS= read -r file; do
  [ -n "$file" ] || continue
  [ "$(head -1 "$file")" = "// SPDX-License-Identifier: AGPL-3.0-or-later" ] || unstamped="$unstamped $file"
done <<< "$sources"
if [ "$source_count" -eq 0 ]; then
  record FAIL 11 "every .ts under src and test opens with the SPDX line" "no source files enumerated"
elif [ "$source_count" != "$found_count" ]; then
  record FAIL 11 "every .ts under src and test opens with the SPDX line" "git listed $source_count files, find listed $found_count"
elif [ -n "$unstamped" ]; then
  record FAIL 11 "every .ts under src and test opens with the SPDX line" "missing on:$unstamped"
else
  record PASS 11 "every .ts under src and test opens with the SPDX line" "$source_count files checked"
fi

# 12
if node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"))
  const budget = {
    dependencies: ["fastify", "@prisma/client", "@prisma/adapter-pg"],
    devDependencies: ["prisma", "typescript", "@types/node", "squawk-cli"],
  }
  const over = []
  for (const [field, allowed] of Object.entries(budget)) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (!allowed.includes(name)) over.push(`${name} (${field})`)
    }
  }
  if (over.length) { console.error("outside the budget: " + over.join(", ")); process.exit(1) }
  if (pkg.dependencies?.pg || pkg.devDependencies?.pg) { console.error("pg is a direct dependency"); process.exit(1) }
' > "$work/12" 2>&1; then
  record PASS 12 "dependencies stay inside the budget and pg is not direct"
else
  record FAIL 12 "dependencies stay inside the budget and pg is not direct" "$(cat "$work/12")"
fi

# 13
schema_url=$(grep -nE '^[[:space:]]*url[[:space:]]*=' prisma/schema.prisma)
if [ -n "$schema_url" ]; then
  record FAIL 13 "schema.prisma carries no url and prisma validate passes" "$schema_url"
elif npx prisma validate > "$work/13" 2>&1; then
  record PASS 13 "schema.prisma carries no url and prisma validate passes"
else
  record FAIL 13 "schema.prisma carries no url and prisma validate passes" "$(tail -6 "$work/13")"
fi

# 14
# spelled as a pattern so this script is not itself a hit
spawn_shell='shell:[[:space:]]*true'
printf 'spawn(cmd, { %s: %s })\n' shell true > "$work/14.control"
if ! grep -qE "$spawn_shell" "$work/14.control"; then
  record FAIL 14 "no shell-enabled spawn in source" "the pattern does not match a known violation; it cannot gate"
else
  # source only: docs quote the rule, --untracked sees uncommitted files
  hits=$(git grep --untracked -nE "$spawn_shell" -- src test scripts prisma prisma.config.ts)
  if [ -z "$hits" ]; then
    record PASS 14 "no shell-enabled spawn in source"
  else
    record FAIL 14 "no shell-enabled spawn in source" "$hits"
  fi
fi

# 15
find prisma/migrations -name '*.sql' 2>/dev/null | sort > "$work/15.list"
sql=()
while IFS= read -r file; do
  sql+=("$file")
done < "$work/15.list"
if [ "${#sql[@]}" -eq 0 ]; then
  record FAIL 15 "squawk finds no issues in the migrations" "no migration SQL found to lint"
elif npx squawk "${sql[@]}" > "$work/15" 2>&1; then
  record PASS 15 "squawk finds no issues in the migrations" "${#sql[@]} file(s) linted"
else
  record FAIL 15 "squawk finds no issues in the migrations" "$(tail -10 "$work/15")"
fi

# 16
if require_db 16 "every timestamp column carries a time zone"; then
  naive="select count(*) from information_schema.columns where table_schema='public' and table_name in ($TABLES) and data_type='timestamp without time zone'"
  aware="select count(*) from information_schema.columns where table_schema='public' and table_name in ($TABLES) and data_type='timestamp with time zone'"
  present="select count(*) from information_schema.tables where table_schema='public' and table_name in ($TABLES)"
  stamps=$(psql_url -c "select ($naive) || ':' || ($aware) || ':' || ($present)" 2>&1)
  naive_count=${stamps%%:*}
  aware_count=$(printf '%s' "$stamps" | cut -d: -f2)
  table_count=${stamps##*:}
  if [ "$table_count" != "4" ]; then
    record FAIL 16 "every timestamp column carries a time zone" "found $table_count of 4 tables; a zero count would mean nothing was examined"
  elif [ "$naive_count" = "0" ] && [ "${aware_count:-0}" -gt 0 ]; then
    record PASS 16 "every timestamp column carries a time zone" "$aware_count timestamptz, 0 naive"
  else
    record FAIL 16 "every timestamp column carries a time zone" "$naive_count naive column(s), $aware_count with a time zone"
  fi
fi

# 17
# anchored and captured because indentation defeats a naive s/.*image: //
sq_major=$(sed -nE 's/^[[:space:]]*pg_version[[:space:]]*=[[:space:]]*"([0-9]+)(\.[0-9]+)?".*/\1/p' .squawk.toml)
img_major=$(sed -nE 's/^[[:space:]]*image:[[:space:]]*postgres:([0-9]+).*/\1/p' compose.yaml)
excluded=$(grep -nE '^[[:space:]]*excluded_rules[[:space:]]*=' .squawk.toml)
if [ -n "$excluded" ]; then
  record FAIL 17 "squawk config states facts and matches the Postgres image" "$excluded"
elif [ -z "$sq_major" ] || [ -z "$img_major" ]; then
  record FAIL 17 "squawk config states facts and matches the Postgres image" \
    ".squawk.toml pg_version is '${sq_major:-unreadable}', compose.yaml image major is '${img_major:-unreadable}'"
elif [ "$sq_major" = "$img_major" ]; then
  record PASS 17 "squawk config states facts and matches the Postgres image" "both on Postgres $sq_major"
else
  record FAIL 17 "squawk config states facts and matches the Postgres image" "pg_version says $sq_major, compose.yaml says $img_major"
fi

ran=$(grep -c . "$log")
fails=$(grep -c '^FAIL ' "$log")

echo
if [ "$fails" -eq 0 ] && [ "$ran" -eq "$EXPECTED_CHECKS" ]; then
  echo "Phase 1a: $ran of $EXPECTED_CHECKS checks passed."
  exit 0
fi
echo "Phase 1a: $fails failing, $ran of $EXPECTED_CHECKS checks ran."
exit 1

#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later

# Runs the Tuffgal stories against the real app with its own database,
# repo root, and frozen clock. Args pass through, e.g. `--headed`, and
# `--seed-only` seeds without running stories. Runs once per color scheme.

set -eu

# .env is on the container's bind mount too, and its url is the host's
supplied="${DATABASE_URL:-}"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

if [ -n "$supplied" ]; then
  DATABASE_URL="$supplied"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL isn't set. Copy .env.example to .env." >&2
  exit 1
fi

if [ ! -d dist/test/support ]; then
  echo "dist/ is missing. Run npm run build first." >&2
  exit 1
fi

# every pinned value the harness runs on, from the one file that declares
# them, so the shell cannot drift from what the fixture was built for
pinned=$(node --input-type=module -e \
  'import { frozenNow, visualDatabase, visualOrigin, visualRepoRoot }
     from "./dist/test/support/fixture-repos.js";
   process.stdout.write(`${frozenNow}\n${visualDatabase}\n${visualOrigin}\n${visualRepoRoot}\n`);')

CARN_FROZEN_NOW=$(printf '%s\n' "$pinned" | sed -n 1p)
visual_db=$(printf '%s\n' "$pinned" | sed -n 2p)
CARN_ORIGIN=$(printf '%s\n' "$pinned" | sed -n 3p)
CARN_REPO_ROOT="$PWD/$(printf '%s\n' "$pinned" | sed -n 4p)"

admin_url="$DATABASE_URL"

# swap the database name, leaving any query string intact
visual_url=$(printf '%s' "$DATABASE_URL" | sed -E "s#(://[^/]*)/[^/?]*#\1/$visual_db#")

# the image ships none, and prisma migrate deploy makes the db anyway
if command -v psql > /dev/null 2>&1; then
  psql "$admin_url" --no-psqlrc -q -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$visual_db'" \
    | grep -q 1 \
    || psql "$admin_url" --no-psqlrc -q -c "CREATE DATABASE \"$visual_db\""
fi

DATABASE_URL="$visual_url" npx prisma migrate deploy >/dev/null
DATABASE_URL="$visual_url"

export CARN_FROZEN_NOW CARN_ORIGIN CARN_REPO_ROOT DATABASE_URL

if [ "${1:-}" = "--seed-only" ]; then
  node --input-type=module -e \
    'import { resetVisualState } from "./dist/test/support/visual-db.js";
     await resetVisualState();'

  echo "Seeded. Serve with:"
  echo "  CARN_FROZEN_NOW=$CARN_FROZEN_NOW \\"
  echo "  CARN_ORIGIN=$CARN_ORIGIN \\"
  echo "  CARN_REPO_ROOT=$CARN_REPO_ROOT \\"
  echo "  DATABASE_URL=$DATABASE_URL \\"
  echo "  node dist/scripts/visual-server.js"
  exit 0
fi

# set -e on a CI-mode exit 2 would skip light entirely; rank 1 > 3 > 2 > 0
worst=0

rank() {
  case "$1" in
    1) echo 3 ;;
    3) echo 2 ;;
    2) echo 1 ;;
    0) echo 0 ;;
    # an undocumented code (a crash, a kill signal) outranks every known one
    *) echo 4 ;;
  esac
}

for scheme in dark light; do
  echo "== $scheme =="

  code=0
  CARN_VISUAL_SCHEME="$scheme" npx tuffgal run --manage-servers "$@" || code=$?

  if [ "$(rank "$code")" -gt "$(rank "$worst")" ]; then
    worst="$code"
  fi
done

exit "$worst"

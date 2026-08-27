#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Runs the Tuffgal stories against the real app: its own database, its own
# repo root, and the frozen clock the pinned fixture was built for. Never
# touches the dev database or the dev repo root. Args pass through, e.g.
# `npm run visual -- --headed`. With --seed-only it prepares the database
# and the repos, then prints how to serve them, and runs no stories.

set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL isn't set. Copy .env.example to .env." >&2
  exit 1
fi

if [ ! -d dist/test/support ]; then
  echo "dist is missing. Run npm run build first." >&2
  exit 1
fi

# every pinned value the harness runs on, from the one file that declares
# them, so the shell cannot drift from what the fixture was built for
pinned=$(node --input-type=module -e \
  'import { frozenNow, visualDatabase, visualRepoRoot }
     from "./dist/test/support/fixture-repos.js";
   process.stdout.write(`${frozenNow}\n${visualDatabase}\n${visualRepoRoot}\n`);')

CARN_FROZEN_NOW=$(printf '%s\n' "$pinned" | sed -n 1p)
visual_db=$(printf '%s\n' "$pinned" | sed -n 2p)
CARN_REPO_ROOT="$PWD/$(printf '%s\n' "$pinned" | sed -n 3p)"

admin_url="$DATABASE_URL"

# swap the database name, leaving any query string intact
visual_url=$(printf '%s' "$DATABASE_URL" | sed -E "s#(://[^/]*)/[^/?]*#\1/$visual_db#")

psql "$admin_url" --no-psqlrc -q -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$visual_db'" \
  | grep -q 1 \
  || psql "$admin_url" --no-psqlrc -q -c "CREATE DATABASE \"$visual_db\""

DATABASE_URL="$visual_url" npx prisma migrate deploy >/dev/null

DATABASE_URL="$visual_url"

export CARN_FROZEN_NOW CARN_REPO_ROOT DATABASE_URL

if [ "${1:-}" = "--seed-only" ]; then
  node --input-type=module -e \
    'import { resetVisualState } from "./dist/test/support/visual-db.js";
     await resetVisualState();'

  echo "Seeded. Serve them with:"
  echo "  DATABASE_URL=$DATABASE_URL \\"
  echo "  CARN_REPO_ROOT=$CARN_REPO_ROOT \\"
  echo "  CARN_FROZEN_NOW=$CARN_FROZEN_NOW \\"
  echo "  node dist/scripts/visual-server.js"
  exit 0
fi

exec npx tuffgal run --manage-servers "$@"

#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later

# Approves the candidates a --ci run left behind, once per color scheme.
# tuffgal.config.ts reads CARN_VISUAL_SCHEME and imports from dist/, so
# approve needs the same environment a run does. Args pass through, and a
# scheme with no candidates is skipped rather than failed.

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

export DATABASE_URL

# the mode of the newest run for a scheme, or "" when it never ran
mode_of() {
  node -e 'const { readFileSync } = require("node:fs");
    try {
      process.stdout.write(JSON.parse(readFileSync(process.argv[1], "utf8")).mode ?? "");
    } catch {
      process.stdout.write("");
    }' "$1" 2>/dev/null || true
}

found=0
stale=0
worst=0

for scheme in dark light; do
  candidates="tuffgal/report/$scheme/candidates"
  report="tuffgal/report/$scheme/results.json"

  # no candidates means that scheme came back unchanged, which is a pass
  if [ ! -d "$candidates" ]; then
    echo "== $scheme == no candidates, nothing to approve"
    continue
  fi

  # a local run leaves the report beside an older CI run's candidates, so
  # the tree is still there and no longer describes anything current
  mode=$(mode_of "$report")
  if [ "$mode" != "ci" ]; then
    echo "== $scheme == candidates are stale: the newest run was ${mode:-none}, not ci" >&2
    stale=1
    continue
  fi

  echo "== $scheme =="
  found=1

  code=0
  CARN_VISUAL_SCHEME="$scheme" npx tuffgal approve --from "$candidates" "$@" \
    || code=$?

  if [ "$code" -gt "$worst" ]; then
    worst="$code"
  fi
done

if [ "$stale" -eq 1 ]; then
  echo
  echo "Promoting those would write an old capture over current baselines."
  echo "Shoot a fresh one first with:"
  echo "  sh scripts/visual-docker.sh"
  exit 1
fi

if [ "$found" -eq 0 ]; then
  echo
  echo "Neither scheme has candidates. Shoot them first with:"
  echo "  sh scripts/visual-docker.sh"
  exit 1
fi

exit "$worst"

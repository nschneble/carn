#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later

# Shoots the Tuffgal baselines in the Linux container CI will use, because a
# laptop's CoreText renders every glyph differently from FreeType. Args pass
# through to `tuffgal run`. A GitHub Actions job should call this, not
# reimplement it.

set -eu

compose="docker compose"
service=visual
password="${POSTGRES_PASSWORD:-carn}"

$compose up -d postgres

# the image has no psql, so the service that does makes the database
$compose exec -T postgres \
  psql -U carn -d carn -v ON_ERROR_STOP=0 --no-psqlrc -q \
  -c "CREATE DATABASE carn_visual" > /dev/null 2>&1 || true

$compose run --rm \
  -e "POSTGRES_PASSWORD=$password" \
  "$service" \
  sh -c 'npm ci --no-audit --no-fund && npm run build && sh scripts/visual.sh --ci "$@"' \
  -- "$@"

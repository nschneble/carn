#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later

# Shoots the Tuffgal baselines in the Linux container CI will use, since
# a laptop's CoreText renders every glyph differently from FreeType. Args
# pass through to `tuffgal run`. A GitHub Actions job should call this,
# not reimplement it.

set -eu

compose="docker compose"
service=visual

$compose up -d postgres

# always --ci, so visual.sh's --seed-only is unreachable from here
$compose run --rm \
  "$service" \
  sh -c 'npm ci --no-audit --no-fund && npm run build && sh scripts/visual.sh --ci "$@"' \
  -- "$@"

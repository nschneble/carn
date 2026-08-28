// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from "tuffgal";

import { frozenNow, visualOrigin } from "./dist/test/support/fixture-repos.js";
import { resetVisualState } from "./dist/test/support/visual-db.js";

// scripts/visual.sh sets the environment this needs; run that, not tuffgal

const scheme = process.env.CARN_VISUAL_SCHEME;

if (scheme !== "dark" && scheme !== "light") {
  throw new Error(
    `CARN_VISUAL_SCHEME is ${scheme ?? "unset"}, wanted dark or light. tuffgal pins the colour scheme per run, so run sh scripts/visual.sh, which runs both.`,
  );
}

export default defineConfig({
  paths: {
    actions: "tuffgal/actions",
    stories: "tuffgal/stories",
    // colorScheme is a pixel-affecting manifest key, so one dir per run.
    // the local cache too: shared, the second run self-diffs against the
    // first and every screen reports changed
    baselines: `tuffgal/baselines/${scheme}`,
    localCache: `tuffgal/.cache/${scheme}`,
    report: `tuffgal/report/${scheme}`,
  },

  baseUrl: visualOrigin,

  // the only thing that picks a palette, now that no page carries a theme
  colorScheme: scheme,

  // BRAND.md's 1440 is not in tuffgal's registry, whose desktop is 1280
  breakpoints: [{ name: "desktop", width: 1440, height: 900 }],

  // a forge page is mostly below the fold: tree, readme, footer
  captureMode: "fullPage",

  // matches the server-side CARN_FROZEN_NOW, so the two never disagree
  frozenTime: frozenNow,

  database: { reset: resetVisualState },

  devServers: {
    command: "node dist/scripts/visual-server.js",
    healthCheck: [{ url: `${visualOrigin}/health`, timeoutMs: 60_000 }],
  },
});

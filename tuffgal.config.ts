// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from "tuffgal";

import { frozenNow, visualOrigin } from "./dist/test/support/fixture-repos.js";
import { resetVisualState } from "./dist/test/support/visual-db.js";

// scripts/visual.sh sets the environment this needs; run that, not tuffgal

export default defineConfig({
  paths: {
    actions: "tuffgal/actions",
    stories: "tuffgal/stories",
    baselines: "tuffgal/baselines",
    report: "tuffgal/report",
    // committed; tuffgal's own default .gitignore excludes .auth
    authState: "tuffgal/theme-state",
  },

  baseUrl: visualOrigin,

  // no story produces these; each is a committed cookie fixture instead
  seededLabels: ["theme-dark", "theme-light"],

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

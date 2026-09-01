// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from "tuffgal";

import { frozenNow, visualOrigin } from "./dist/test/support/fixture-repos.js";
import { resetVisualState } from "./dist/test/support/visual-db.js";

// scripts/visual.sh sets the environment this needs; run that, not Tuffgal

const scheme = process.env.CARN_VISUAL_SCHEME;

if (scheme !== "dark" && scheme !== "light") {
  throw new Error(
    `CARN_VISUAL_SCHEME is ${scheme ?? "unset"}, wanted dark or light. Tuffgal pins the color scheme per run, so run \`sh scripts/visual.sh\`, which runs both.`,
  );
}

export default defineConfig({
  paths: {
    actions: "tuffgal/actions",
    stories: "tuffgal/stories",
    // colorScheme is pixel-affecting, so each run gets its own dir
    baselines: `tuffgal/baselines/${scheme}`,
    localCache: `tuffgal/.cache/${scheme}`,
    report: `tuffgal/report/${scheme}`,
  },
  baseUrl: visualOrigin,
  colorScheme: scheme,
  // without it chromium renders through whatever icc profile the host has
  browserArgs: ["--force-color-profile=srgb"],
  // the two that bracket the stylesheet's single min-width: 640px query.
  // BRAND.md's 1440 is not in Tuffgal's registry, whose desktop is 1280
  breakpoints: [
    { name: "mobile", width: 375, height: 812 },
    { name: "desktop", width: 1440, height: 900 },
  ],
  // a forge page is mostly below the fold: tree, readme, footer
  captureMode: "fullPage",
  frozenTime: frozenNow,
  database: { reset: resetVisualState },
  devServers: {
    command: "node dist/scripts/visual-server.js",
    healthCheck: [{ url: `${visualOrigin}/health`, timeoutMs: 60_000 }],
  },
});

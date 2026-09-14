// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from "tuffgal";

import { frozenNow, visualOrigin } from "./dist/test/support/fixture-repos.js";
import { resetVisualState } from "./dist/test/support/visual-db.js";

// don't run Tuffgal directly; run `npm run visual` which first builds and
// sets up the environment

const scheme = process.env.CARN_VISUAL_SCHEME;
if (scheme !== "dark" && scheme !== "light") {
  throw new Error(
    `CARN_VISUAL_SCHEME can only be "light" or "dark" (got "${scheme ?? "unset"}")`,
  );
}

export default defineConfig({
  baseUrl: visualOrigin,
  breakpoints: [
    { name: "mobile", width: 375, height: 812 },
    { name: "desktop", width: 1440, height: 900 },
  ],
  // a forge page is mostly below the fold: tree, readme, and footer
  captureMode: "fullPage",
  colorScheme: scheme,
  database: { reset: resetVisualState },
  devServers: {
    command: "node dist/scripts/visual-server.js",
    healthCheck: [{ url: `${visualOrigin}/health`, timeoutMs: 60_000 }],
  },
  frozenTime: frozenNow,
  interactiveMode: true,
  paths: {
    actions: "tuffgal/actions",
    baselines: `tuffgal/baselines/${scheme}`,
    localCache: `tuffgal/.cache/${scheme}`,
    report: `tuffgal/report/${scheme}`,
    stories: "tuffgal/stories",
  },
});

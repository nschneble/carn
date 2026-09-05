// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import { renderPaths } from "../support/render-paths.js";

// every suite iterating this list still passes with an entry missing
test("the render paths are exactly the two schemes, field for field", (t) => {
  assert.deepStrictEqual(renderPaths, [
    { name: "colorScheme light", colorScheme: "light", palette: "light" },
    { name: "colorScheme dark", colorScheme: "dark", palette: "dark" },
  ]);

  t.diagnostic(`render paths pinned: ${renderPaths.length}`);
});

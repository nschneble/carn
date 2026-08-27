// SPDX-License-Identifier: AGPL-3.0-or-later

// criterion 16. a stamped baseline is only stamped because the committed
// storage state carries the theme cookie, and every way that file can go
// wrong ends the same way, in an unstamped page nobody notices: a renamed
// cookie, a value the parser rejects, a foreign domain, a passed expiry

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { readTheme, type Theme, themeCookie } from "../../src/html/theme.js";
import { visualHost } from "../support/fixture-repos.js";

type StorageState = {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
  }[];
  origins: unknown[];
};

const stateDir = resolve(import.meta.dirname, "../../../tuffgal/theme-state");
const themes: Theme[] = ["dark", "light"];

function state(theme: Theme): StorageState {
  return JSON.parse(
    readFileSync(join(stateDir, `theme-${theme}.json`), "utf8"),
  ) as StorageState;
}

test("each theme fixture seeds the cookie the server actually reads", () => {
  for (const theme of themes) {
    const cookies = state(theme).cookies;

    assert.strictEqual(cookies.length, 1, `theme-${theme}.json`);

    const cookie = cookies[0];

    assert.ok(cookie);
    assert.strictEqual(
      cookie.name,
      themeCookie,
      "the fixture names a cookie readTheme ignores, so the page renders unstamped",
    );
    assert.strictEqual(
      readTheme(`${cookie.name}=${cookie.value}`),
      theme,
      "the product's own parser does not read this fixture as that theme",
    );
  }
});

test("each theme fixture outlives the run and reaches the harness origin", () => {
  for (const theme of themes) {
    const cookie = state(theme).cookies[0];

    assert.ok(cookie);
    assert.strictEqual(
      cookie.domain,
      visualHost,
      "a cookie for another host is never sent, and the page renders unstamped",
    );
    assert.strictEqual(cookie.path, "/");
    assert.strictEqual(
      cookie.expires,
      -1,
      "a session cookie is the only kind the frozen clock cannot expire",
    );
  }
});

// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import type { AxeResults, Result } from "axe-core";
import { type Browser, chromium } from "playwright";
import { galleryDocument } from "../gallery/document.js";
import { renderPaths } from "../support/render-paths.js";

declare const document: object;
declare const axe: {
  run(context: object, options: { runOnly: string[] }): Promise<AxeResults>;
};

const axeSource = createRequire(import.meta.url).resolve("axe-core");
const ruleset = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const beyondWcag20 = [
  "autocomplete-valid",
  "avoid-inline-spacing",
  "target-size",
];
const skippedAsExperimental = [
  "css-orientation-lock",
  "label-content-name-mismatch",
];

const plantedFailures = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Planted failures</title>
</head>
<body>
<main>
<h1>Three defects</h1>
<p style="color: #d3d3d3; background: #ffffff">This pair measures 1.5 to 1</p>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="40" height="40" />
</main>
</body>
</html>
`;

let browser: Browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function run(
  markup: string,
  colorScheme: "light" | "dark" = "light",
): Promise<AxeResults> {
  const page = await browser.newPage();

  try {
    await page.emulateMedia({ colorScheme });
    await page.setContent(markup);
    await page.addScriptTag({ path: axeSource });

    return await page.evaluate(
      async (tags) => await axe.run(document, { runOnly: tags }),
      ruleset,
    );
  } finally {
    await page.close();
  }
}

async function violations(
  markup: string,
  colorScheme: "light" | "dark" = "light",
): Promise<Result[]> {
  return (await run(markup, colorScheme)).violations;
}

function report(found: Result[]): string {
  return found
    .map((rule) => `${rule.id} (${rule.impact}) ${rule.nodes[0]?.html ?? ""}`)
    .join("\n");
}

for (const path of renderPaths) {
  test(`no axe violations in the ${path.name} gallery`, async () => {
    const found = await violations(
      galleryDocument(path.theme),
      path.colorScheme,
    );

    assert.deepStrictEqual(
      found.map((rule) => rule.id),
      [],
      report(found),
    );
  });
}

test("the rules above WCAG 2.0 report which of them found anything", async (t) => {
  const results = await run(galleryDocument("dark"));
  const buckets = [
    "violations",
    "incomplete",
    "passes",
    "inapplicable",
  ] as const;
  const bucketOf = (name: string) =>
    buckets.find((bucket) => results[bucket].some((rule) => rule.id === name));

  for (const name of beyondWcag20) {
    const landed = bucketOf(name);

    assert.ok(
      landed,
      `${name} is in no bucket, so the ruleset stopped loading it — wcag21a, wcag21aa, and wcag22aa are pinned by criterion 11, not decoration`,
    );
    assert.notStrictEqual(landed, "violations", `${name} is violated`);
    t.diagnostic(`${name}: ${landed}`);
  }

  for (const name of skippedAsExperimental) {
    assert.strictEqual(
      bucketOf(name),
      undefined,
      `${name} now runs; axe skips every rule tagged experimental, so this ruleset covers more than it used to and the reporting here is stale`,
    );
    t.diagnostic(`${name}: never runs, tagged experimental`);
  }

  const hitAreas = results.passes.find((rule) => rule.id === "target-size");
  assert.ok(
    hitAreas && hitAreas.nodes.length > 0,
    "target-size evaluated nothing, so wcag22aa pins no hit area and the repo row rests on the screenshot baseline alone",
  );
  t.diagnostic(`target-size evaluated ${hitAreas.nodes.length} hit areas`);
});

test("axe reports a planted failure", async () => {
  const found = await violations(plantedFailures);

  for (const rule of ["html-has-lang", "image-alt", "color-contrast"]) {
    assert.ok(
      found.some((violation) => violation.id === rule),
      `axe did not report ${rule}, so a clean gallery run proves nothing:\n${report(found)}`,
    );
  }
});

test("axe reads the gallery's own stylesheet, not a bare document", async () => {
  const darkened = galleryDocument("dark").replace(
    "--ink: #f2f4f4;",
    "--ink: #1a1c1c;",
  );
  const found = await violations(darkened);

  assert.ok(
    found.some((violation) => violation.id === "color-contrast"),
    `a token darkened to the ground went unreported:\n${report(found)}`,
  );
});

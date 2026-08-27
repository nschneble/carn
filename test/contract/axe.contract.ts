// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import type { AxeResults, Result } from "axe-core";
import { type Browser, chromium } from "playwright";
import { galleryDocument } from "../gallery/document.js";

declare const document: object;
declare const axe: {
  run(context: object, options: { runOnly: string[] }): Promise<AxeResults>;
};

const axeSource = createRequire(import.meta.url).resolve("axe-core");
const ruleset = ["wcag2a", "wcag2aa"];

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

async function violations(markup: string): Promise<Result[]> {
  const page = await browser.newPage();

  try {
    await page.setContent(markup);
    await page.addScriptTag({ path: axeSource });

    const results = await page.evaluate(
      async (tags) => await axe.run(document, { runOnly: tags }),
      ruleset,
    );

    return results.violations;
  } finally {
    await page.close();
  }
}

function report(found: Result[]): string {
  return found
    .map((rule) => `${rule.id} (${rule.impact}) ${rule.nodes[0]?.html ?? ""}`)
    .join("\n");
}

for (const theme of ["dark", "light", null] as const) {
  test(`no axe violations in the ${theme ?? "unstamped"} gallery`, async () => {
    const found = await violations(galleryDocument(theme));

    assert.deepStrictEqual(
      found.map((rule) => rule.id),
      [],
      report(found),
    );
  });
}

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

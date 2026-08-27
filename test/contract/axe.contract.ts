// SPDX-License-Identifier: AGPL-3.0-or-later

// axe drops experimental and deprecated rules from a tag selection; the
// experimental ones are computed back on and the deprecated ones are not,
// which the pinned list below asserts by their own tag rather than by name

import assert from "node:assert";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import type { AxeResults, NodeResult, Result } from "axe-core";
import type { Page } from "playwright";
import { errorPage, noSuchRepo } from "../../src/html/error-page.js";
import { stylesheet } from "../../src/html/styles.js";
import { renderMarkdown } from "../../src/markdown/render.js";
import { galleryDocument } from "../gallery/document.js";
import { hoverSimulation, indexDocument } from "../gallery/repo-index.js";
import { showDocument, view } from "../gallery/repo-show.js";
import {
  type BrowserDocument,
  browser,
  closeBrowser,
} from "../support/browser.js";
import { renderPaths } from "../support/render-paths.js";
import { type Served, serve } from "../support/serve.js";

declare const document: BrowserDocument;
declare const axe: {
  getRules(): { ruleId: string; tags: string[] }[];
  run(
    context: object,
    options: {
      runOnly: string[];
      rules: Record<string, { enabled: boolean }>;
    },
  ): Promise<AxeResults>;
};

type Audit = {
  results: AxeResults;
  forced: string[];
  unevaluated: string[];
  deprecated: string[];
};

const axeSource = createRequire(import.meta.url).resolve("axe-core");
const ruleset = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

const beyondWcag20 = [
  "autocomplete-valid",
  "avoid-inline-spacing",
  "target-size",
];

const experimentalInRuleset = [
  "css-orientation-lock",
  "focus-order-semantics",
  "hidden-content",
  "label-content-name-mismatch",
  "p-as-heading",
  "table-fake-caption",
  "td-has-header",
];

const retiredByAxe = [
  "aria-roledescription",
  "audio-caption",
  "landmark-complementary-is-top-level",
];

// no lang attribute on purpose: html-has-lang is one of the three planted
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

const plantedNameMismatch = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Planted name mismatch</title>
</head>
<body>
<main>
<h1>One defect</h1>
<button type="button" aria-label="Close">Save changes</button>
</main>
</body>
</html>
`;

const tableSource = `| Ref | Kind | Note |
| --- | --- | --- |
| \`main\` | branch | the default |
| \`v1.0.0\` | tag | signed, annotated |
| \`14-conflict-output\` | branch | ahead by 3 |
`;

const renderedTable = renderMarkdown(tableSource).value;

// repoint at the shared page shell once a wave gives markdown one
const readmeTable = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rendered README table · Càrn</title>
<style>
${stylesheet}
</style>
</head>
<body>
<main id="main" tabindex="-1">
<h1 class="t-label">Refs</h1>
${renderedTable}</main>
</body>
</html>
`;

const buckets = ["violations", "incomplete", "passes", "inapplicable"] as const;

const fixtures: Record<string, string> = {};

const emptyRepo = view({ tip: null, entries: [], readme: null });

for (const path of renderPaths) {
  const key = `${path.palette}-${path.theme ?? "unstamped"}`;
  fixtures[`/populated-${key}`] = indexDocument({ theme: path.theme });
  fixtures[`/hover-${key}`] = indexDocument({ theme: path.theme, hover: true });
  fixtures[`/empty-${key}`] = indexDocument({ theme: path.theme, repos: [] });

  fixtures[`/show-${key}`] = showDocument({ theme: path.theme });
  fixtures[`/show-all-${key}`] = showDocument({
    theme: path.theme,
    showAll: true,
  });
  fixtures[`/show-bare-${key}`] = showDocument({
    theme: path.theme,
    repo: view({ readme: null }),
  });
  fixtures[`/show-new-${key}`] = showDocument({
    theme: path.theme,
    repo: emptyRepo,
  });
  fixtures[`/not-found-${key}`] = errorPage({
    failure: noSuchRepo("linklater"),
    theme: path.theme,
  });
}

let site: Served;

before(async () => {
  site = await serve({ documents: fixtures, extraCss: hoverSimulation });
});

after(async () => {
  await closeBrowser();
  await site?.close();
});

async function audit(
  load: (page: Page) => Promise<void>,
  colorScheme: "light" | "dark",
): Promise<Audit> {
  const page = await (await browser()).newPage();

  try {
    await page.emulateMedia({ colorScheme });
    await load(page);
    await page.evaluate(() => document.fonts.ready);

    return await page.evaluate(async (tags) => {
      const selected = new Set(tags);
      const inSelection = axe
        .getRules()
        .filter((rule) => rule.tags.some((tag) => selected.has(tag)));
      const forced = inSelection
        .filter((rule) => rule.tags.includes("experimental"))
        .map((rule) => rule.ruleId)
        .sort();

      const results = await axe.run(document, {
        runOnly: tags,
        rules: Object.fromEntries(forced.map((id) => [id, { enabled: true }])),
      });

      const evaluated = new Set(
        (["violations", "incomplete", "passes", "inapplicable"] as const)
          .flatMap((bucket) => results[bucket])
          .map((rule) => rule.id),
      );

      return {
        results,
        forced,
        unevaluated: inSelection
          .map((rule) => rule.ruleId)
          .filter((id) => !evaluated.has(id))
          .sort(),
        deprecated: inSelection
          .filter((rule) => rule.tags.includes("deprecated"))
          .map((rule) => rule.ruleId)
          .sort(),
      };
    }, ruleset);
  } finally {
    await page.close();
  }
}

async function run(
  markup: string,
  colorScheme: "light" | "dark" = "light",
): Promise<Audit> {
  return audit(async (page) => {
    await page.setContent(markup);
    await page.addScriptTag({ path: axeSource });
  }, colorScheme);
}

// the served CSP blocks addScriptTag; an init script goes over CDP
async function fetched(
  path: string,
  colorScheme: "light" | "dark",
): Promise<Audit> {
  return audit(async (page) => {
    await page.addInitScript({ path: axeSource });
    await page.goto(`${site.origin}${path}`);
  }, colorScheme);
}

async function violations(
  markup: string,
  colorScheme: "light" | "dark" = "light",
): Promise<Result[]> {
  return (await run(markup, colorScheme)).results.violations;
}

function report(found: Result[]): string {
  return found
    .map((rule) => `${rule.id} (${rule.impact}) ${rule.nodes[0]?.html ?? ""}`)
    .join("\n");
}

// these two reach no verdict on any page; incomplete is all they report
const alwaysIncomplete = new Set(["css-orientation-lock", "hidden-content"]);

// axe declines contrast on the decorative arrow's non-text glyph
function nonText(node: NodeResult): boolean {
  return node.any.some(
    (check) =>
      check.id === "color-contrast" &&
      (check.data as { messageKey?: string } | null)?.messageKey === "nonBmp",
  );
}

function decided(results: AxeResults): void {
  const undecided = results.incomplete
    .filter((rule) => !alwaysIncomplete.has(rule.id))
    .flatMap((rule) =>
      rule.nodes
        .filter((node) => !nonText(node))
        .map((node) => `${rule.id} ${node.html}`),
    );

  assert.deepStrictEqual(
    undecided,
    [],
    `axe reached no verdict on these, so the clean violations list is measuring fewer nodes than it looks like:\n${undecided.join("\n")}`,
  );
}

for (const path of renderPaths) {
  test(`no axe violations in the ${path.name} gallery`, async () => {
    const { results } = await run(
      galleryDocument(path.theme),
      path.colorScheme,
    );

    assert.deepStrictEqual(
      results.violations.map((rule) => rule.id),
      [],
      report(results.violations),
    );
    decided(results);
  });
}

for (const path of renderPaths) {
  const key = `${path.palette}-${path.theme ?? "unstamped"}`;

  for (const state of [
    "populated",
    "hover",
    "empty",
    "show",
    "show-all",
    "show-bare",
    "show-new",
    "not-found",
  ]) {
    test(`no axe violations on the ${state} page, ${path.name}`, async () => {
      const { results } = await fetched(`/${state}-${key}`, path.colorScheme);

      assert.deepStrictEqual(
        results.violations.map((rule) => rule.id),
        [],
        report(results.violations),
      );
      decided(results);
    });
  }
}

test("the hover wash is measured under the two columns that sit on it", async (t) => {
  for (const path of renderPaths) {
    const key = `${path.palette}-${path.theme ?? "unstamped"}`;
    const { results } = await fetched(`/hover-${key}`, path.colorScheme);
    const contrast: Result | undefined = results.passes.find(
      (rule) => rule.id === "color-contrast",
    );

    assert.ok(
      contrast,
      `color-contrast evaluated nothing on the ${path.name} hover fixture, so the stylesheet never reached the page and a clean run proves nothing`,
    );

    for (const column of ['class="msg"', "<time datetime="]) {
      const measured: number = contrast.nodes.filter((node) =>
        node.html.includes(column),
      ).length;

      assert.ok(
        measured > 0,
        `color-contrast never measured ${column} on the ${path.name} hover fixture`,
      );
      t.diagnostic(`${path.name} ${column}: ${measured} measured`);
    }
  }
});

test("the ruleset's experimental rules are the ones forced on", async () => {
  const { forced } = await run(galleryDocument("dark"));

  assert.deepStrictEqual(
    forced,
    experimentalInRuleset,
    "the computed override no longer matches the pinned set, so axe has added or dropped an experimental rule under these tags — read the diff and decide, do not re-pin blindly",
  );
});

test("only axe's own deprecated rules go unevaluated", async () => {
  const { unevaluated, deprecated } = await run(galleryDocument("dark"));

  assert.deepStrictEqual(
    unevaluated,
    retiredByAxe,
    "a rule the ruleset selects did not execute and is not one of the deprecated rules held off deliberately — axe is excluding it by a mechanism this file does not know about",
  );

  assert.deepStrictEqual(
    deprecated,
    retiredByAxe,
    "the pinned list is no longer exactly the rules axe itself tags deprecated, so it has drifted into a list of rules this project gave up on",
  );
});

test("the rules above WCAG 2.0 report which of them found anything", async (t) => {
  const { results } = await run(galleryDocument("dark"));
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

  for (const name of experimentalInRuleset) {
    const landed = bucketOf(name);

    assert.ok(
      landed,
      `${name} is in no bucket, so the rules override stopped forcing it on — axe leaves every experimental rule out of tag selection, and without the override this gate silently shrinks`,
    );
    assert.notStrictEqual(landed, "violations", `${name} is violated`);
    t.diagnostic(`${name}: ${landed}`);
  }

  const hitAreas = results.passes.find((rule) => rule.id === "target-size");
  assert.ok(
    hitAreas && hitAreas.nodes.length > 0,
    "target-size evaluated nothing, so wcag22aa pins no hit area and the repo row rests on the screenshot baseline alone",
  );
  t.diagnostic(`target-size evaluated ${hitAreas.nodes.length} hit areas`);
});

test("a rendered README table exercises the table rules", async (t) => {
  const { results } = await run(readmeTable);

  assert.deepStrictEqual(
    results.violations.map((rule) => rule.id),
    [],
    report(results.violations),
  );

  for (const name of ["table-fake-caption", "td-has-header"]) {
    const passed = results.passes.find((rule) => rule.id === name);

    assert.ok(
      passed && passed.nodes.length > 0,
      `${name} evaluated no table, so forcing it on buys nothing — the fixture stopped rendering a table, or markdown-it stopped emitting one`,
    );
    t.diagnostic(`${name} passed on ${passed.nodes.length} table`);
  }
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

test("axe reports a planted accessible name mismatch", async () => {
  const found = await violations(plantedNameMismatch);

  assert.ok(
    found.some((violation) => violation.id === "label-content-name-mismatch"),
    `a button labelled Close over the words Save changes went unreported, so the rules override is not reaching axe:\n${report(found)}`,
  );
});

test("axe reads the gallery's own stylesheet, in both palettes", async () => {
  const planted = [
    { theme: "dark", from: "\n  --ink: #f2f4f4;", to: "\n  --ink: #1a1c1c;" },
    { theme: "light", from: "\n  --ink: #0e0f0f;", to: "\n  --ink: #eceeee;" },
  ] as const;

  for (const { theme, from, to } of planted) {
    const markup = galleryDocument(theme);

    assert.strictEqual(
      markup.split(from).length,
      2,
      `the ${theme} --ink declaration is no longer unique in the gallery, so the control moves the wrong token or none`,
    );

    const found = await violations(markup.replace(from, to));

    assert.ok(
      found.some((violation) => violation.id === "color-contrast"),
      `a ${theme} token moved onto its own ground went unreported, so this palette's half of the gate is measuring a bare document:\n${report(found)}`,
    );
  }
});

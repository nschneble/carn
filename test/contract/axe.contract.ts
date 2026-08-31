// SPDX-License-Identifier: AGPL-3.0-or-later

// axe drops experimental and deprecated rules from a tag selection; the
// experimental ones are computed back on and the deprecated ones aren't,
// which the pinned list below asserts by their own tag rather than by name

import assert from "node:assert";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import type { AxeResults, NodeResult, Result } from "axe-core";
import type { Page } from "playwright";
import { errorPage, noSuchRepo } from "../../src/html/error-page.js";
import { styleHref } from "../../src/html/styles.js";
import { renderMarkdown } from "../../src/markdown/render.js";
import { headerAssetPath } from "../../src/repos/header-asset.js";
import { galleryCss, galleryDocument } from "../gallery/document.js";
import { hoverSimulation, indexDocument } from "../gallery/repo-index.js";
import { committedHeader, showDocument, view } from "../gallery/repo-show.js";
import {
  type BrowserDocument,
  browser,
  closeBrowser,
} from "../support/browser.js";
import { fixtureHeaders } from "../support/fixture-repos.js";
import { renderPaths } from "../support/render-paths.js";
import { type Served, type ServedAsset, serve } from "../support/serve.js";

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

// the pair is in a served sheet, not a style attribute: the app's own
// style-src 'self' drops an inline one and takes the defect with it
const plantedContrastCss = `.faint {
  color: #d3d3d3;
  background: #ffffff;
}`;

// no lang attribute on purpose: html-has-lang is one of the three planted
const plantedFailures = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Planted failures</title>
    <link rel="stylesheet" href="/planted-failures.css" />
  </head>
  <body>
    <main>
      <h1>Three defects</h1>
      <p class="faint">This pair measures 1.5 to 1</p>
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

const tableSource = `| Ref                    | Kind   | Note              |
| ---------------------- | ------ | ----------------- |
| \`main\`               | branch | the default       |
| \`v1.0.0\`             | tag    | signed, annotated |
| \`14-conflict-output\` | branch | ahead by 3        |
`;

const renderedTable = renderMarkdown(tableSource).value;

// repoint at the shared page shell once a wave gives markdown one
const readmeTable = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rendered README table · Càrn</title>
    <link rel="stylesheet" href="${styleHref}" />
  </head>
  <body>
    <main id="main" tabindex="-1">
      <h1 class="t-label">Refs</h1>
      ${renderedTable}
    </main>
  </body>
</html>
`;

const buckets = ["violations", "incomplete", "passes", "inapplicable"] as const;

const galleryHref = "/gallery.css";

const fixtures: Record<string, string> = {
  "/gallery": galleryDocument(galleryHref),
  "/readme-table": readmeTable,
  "/planted-failures": plantedFailures,
  "/planted-name-mismatch": plantedNameMismatch,
};

const styles: Record<string, string> = {
  [galleryHref]: galleryCss,
  "/planted-failures.css": plantedContrastCss,
};

const emptyRepo = view({ tip: null, entries: [], readme: null });

// the show page's only external subresource; without it the audited
// header is a broken image and the committed path goes unmeasured
const headerAssets: Record<string, ServedAsset> = {
  [headerAssetPath("linklater", committedHeader.light)]: {
    type: "image/svg+xml",
    body: fixtureHeaders.light,
  },
  [headerAssetPath("linklater", committedHeader.dark)]: {
    type: "image/svg+xml",
    body: fixtureHeaders.dark,
  },
};

// one document per state: nothing is stamped, so the two render paths
// audit the same bytes under two system preferences
const states = {
  populated: indexDocument(),
  hover: indexDocument({ hover: true }),
  empty: indexDocument({ repos: [] }),
  show: showDocument(),
  "show-all": showDocument({ showAll: true }),
  "show-bare": showDocument({ repo: view({ readme: null }) }),
  "show-new": showDocument({ repo: emptyRepo }),
  "show-header": showDocument({ repo: view({ header: committedHeader }) }),
  "not-found": errorPage({ failure: noSuchRepo("linklater") }),
};

for (const [state, markup] of Object.entries(states)) {
  fixtures[`/${state}`] = markup;
}

let site: Served;

before(async () => {
  site = await serve({
    documents: fixtures,
    styles,
    assets: headerAssets,
    extraCss: hoverSimulation,
  });
});

after(async () => {
  await closeBrowser();
  await site?.close();
});

const families = ["Carn Sans", "Carn Mono"];

async function fontState(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(
    (wanted) =>
      Object.fromEntries(
        wanted.map((family) => [
          family,
          [...document.fonts]
            .filter((face) => face.family === family)
            .map((face) => face.status),
        ]),
      ),
    families,
  );
}

// document.fonts.check() isn't the oracle; it answers true for a family
// with no face at all, which is exactly what a document that lost its
// stylesheet looks like, and false for a face the page has not demanded
// yet, which is legitimate (read the face statuses instead)
async function expectFonts(page: Page, where: string): Promise<void> {
  const state = await fontState(page);

  for (const family of families) {
    const faces = state[family] ?? [];
    const seen = `${where} rendered ${family} as [${faces.join(", ") || "no face at all"}]`;

    assert.ok(
      faces.length > 0 && !faces.includes("error"),
      `${seen}, so the audit measured a fallback face and every font-sensitive rule — target-size above all — sized the wrong glyphs`,
    );
    assert.ok(
      faces.includes("loaded"),
      `${seen}, so nothing on the page ever asked for ${family} and its metrics went unmeasured`,
    );
  }
}

async function audit(
  load: (page: Page) => Promise<void>,
  colorScheme: "light" | "dark",
  fonts: string | null,
): Promise<Audit> {
  const page = await (await browser()).newPage();

  try {
    await page.emulateMedia({ colorScheme });
    await load(page);
    await page.evaluate(() => document.fonts.ready);
    if (fonts !== null) await expectFonts(page, fonts);

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

// every audit navigates: page.setContent leaves the document at
// about:blank, where the sheet's root-relative @font-face src cannot
// resolve and the whole audit silently measures the system fallback;
// the served CSP blocks addScriptTag, so an init script goes over CDP
async function fetched(
  path: string,
  colorScheme: "light" | "dark",
  fonts: string | null = path,
): Promise<Audit> {
  return audit(
    async (page) => {
      await page.addInitScript({ path: axeSource });
      await page.goto(`${site.origin}${path}`);
    },
    colorScheme,
    fonts,
  );
}

let planted = 0;

// a gallery served against a doctored copy of its own stylesheet, so a
// planted regression reaches the audit the way a real one would
async function galleryOn(
  css: string,
  colorScheme: "light" | "dark",
  where: string,
): Promise<Audit> {
  planted += 1;
  const path = `/planted-${planted}`;
  styles[`${path}.css`] = css;
  fixtures[path] = galleryDocument(`${path}.css`);

  return fetched(path, colorScheme, where);
}

function report(found: Result[]): string {
  return found
    .map((rule) => `${rule.id} (${rule.impact}) ${rule.nodes[0]?.html ?? ""}`)
    .join("\n");
}

// hiddenContentEvaluate only ever returns undefined or true, so this rule
// can never violate; its incomplete is not a deferred verdict
const alwaysIncomplete = new Set(["hidden-content"]);

// axe declines contrast on the decorative arrow's non-text glyph
function nonText(node: NodeResult): boolean {
  return node.any.some(
    (check) =>
      check.id === "color-contrast" &&
      (check.data as { messageKey?: string } | null)?.messageKey === "nonBmp",
  );
}

// the exemption above is only safe while the arrow inherits its parent's
// color; pin that a passing ancestor still covers each exempted node
function coveredByAPass(results: AxeResults, node: NodeResult): boolean {
  const contrast = results.passes.find((rule) => rule.id === "color-contrast");
  return (
    contrast?.nodes.some((passed) => passed.html.includes(node.html)) ?? false
  );
}

function decided(results: AxeResults): void {
  const undecided = results.incomplete.flatMap((rule) =>
    rule.nodes
      .filter(
        (node) =>
          !alwaysIncomplete.has(rule.id) &&
          !(nonText(node) && coveredByAPass(results, node)),
      )
      .map((node) => `${rule.id} ${node.html}`),
  );

  assert.deepStrictEqual(
    undecided,
    [],
    `axe reached no verdict on these, so the clean violations list is measuring fewer nodes than it looks like:\n${undecided.join("\n")}`,
  );
}

// a clean violations list says nothing about how many nodes reached a
// verdict; a gradient, translucent fill, or background image moves
// contrast nodes from decided to incomplete with every gate still green,
// so count what color-contrast actually measured and settled
function measured(results: AxeResults, id: string): number {
  return (["violations", "passes"] as const).reduce(
    (total, bucket) =>
      total +
      (results[bucket].find((rule) => rule.id === id)?.nodes.length ?? 0),
    0,
  );
}

function contrastPin(results: AxeResults, where: string, pinned: number): void {
  const undecided = results.incomplete.find(
    (rule) => rule.id === "color-contrast",
  );

  assert.strictEqual(
    undecided?.nodes.filter((node) => !nonText(node)).length ?? 0,
    0,
    `${where}: color-contrast reached no verdict on a text node, so the gate is green over an unmeasured one`,
  );

  assert.strictEqual(
    measured(results, "color-contrast"),
    pinned,
    `${where}: color-contrast settled a different number of nodes than the ${pinned} pinned here. A gradient, translucent fill, or background image moves nodes out of the decided set with the violations list still empty`,
  );
}

// measured once per fixture, identical in both schemes: the two paths
// audit the same bytes and differ only in which token block applies
const contrastNodes: Record<string, number> = {
  gallery: 62,
  populated: 18,
  hover: 18,
  empty: 6,
  show: 58,
  "show-all": 116,
  "show-bare": 32,
  "show-new": 5,
  "show-header": 58,
  "not-found": 7,
};

for (const path of renderPaths) {
  for (const state of ["gallery", ...Object.keys(states)]) {
    test(`no axe violations on the ${state} page, ${path.name}`, async () => {
      const { results } = await fetched(`/${state}`, path.colorScheme);

      assert.deepStrictEqual(
        results.violations.map((rule) => rule.id),
        [],
        report(results.violations),
      );
      decided(results);
      contrastPin(
        results,
        `${state} ${path.name}`,
        contrastNodes[state] as number,
      );
    });
  }
}

test("every audited fixture has a pinned contrast count", () => {
  assert.deepStrictEqual(
    Object.keys(contrastNodes).sort(),
    ["gallery", ...Object.keys(states)].sort(),
    "a fixture was added or dropped without its contrast count, so the loop above would pin undefined and settle nothing",
  );
});

// a 404 header is still alt="", so axe stays clean over a broken image
test("the committed header the audit renders is a real 4:1 image", async (t) => {
  const page = await (await browser()).newPage();

  assert.ok(
    states["show-header"].includes("<picture>"),
    "the show-header fixture skipped the <picture> branch, which is the only thing that resolves two committed slots now that nothing is stamped",
  );

  try {
    for (const path of renderPaths) {
      await page.emulateMedia({ colorScheme: path.colorScheme });
      await page.goto(`${site.origin}/show-header`);

      const measured = await page.locator("img.hdr").evaluate((node) => {
        const image = node as HTMLImageElement;
        const box = image.getBoundingClientRect();
        return {
          natural: [image.naturalWidth, image.naturalHeight],
          ratio: box.width / box.height,
        };
      });

      assert.deepStrictEqual(
        measured.natural,
        [1600, 400],
        `the ${path.name} header decoded to ${measured.natural.join("x")}, so the audit measured a broken or off-spec image`,
      );
      assert.ok(
        Math.abs(measured.ratio - 4) < 0.02,
        `the ${path.name} header box is ${measured.ratio.toFixed(3)}:1, not 4:1`,
      );
      t.diagnostic(`${path.name}: ${measured.ratio.toFixed(3)}:1`);
    }
  } finally {
    await page.close();
  }
});

test("the hover wash is measured under the two columns that sit on it", async (t) => {
  for (const path of renderPaths) {
    const { results } = await fetched("/hover", path.colorScheme);
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
  const { forced } = await fetched("/gallery", "dark");

  assert.deepStrictEqual(
    forced,
    experimentalInRuleset,
    "the computed override no longer matches the pinned set, so axe has added or dropped an experimental rule under these tags; read the diff and decide what to do",
  );
});

test("only axe's own deprecated rules go unevaluated", async () => {
  const { unevaluated, deprecated } = await fetched("/gallery", "dark");

  assert.deepStrictEqual(
    unevaluated,
    retiredByAxe,
    "a rule the ruleset selects didn't execute and isn't one of the deprecated rules held off deliberately; axe is excluding it by a mechanism this file doesn't know about",
  );

  assert.deepStrictEqual(
    deprecated,
    retiredByAxe,
    "the pinned list is no longer exactly the rules axe itself tags deprecated, so it's drifted into a list of rules this project abandoned",
  );
});

test("the rules above WCAG 2.0 report which of them found anything", async (t) => {
  const { results } = await fetched("/gallery", "dark");
  const bucketOf = (name: string) =>
    buckets.find((bucket) => results[bucket].some((rule) => rule.id === name));

  for (const name of beyondWcag20) {
    const landed = bucketOf(name);

    assert.ok(
      landed,
      `${name} is in no bucket, so the ruleset stopped loading it; wcag21a, wcag21aa, and wcag22aa are pinned by criterion 11, not decoration`,
    );
    assert.notStrictEqual(landed, "violations", `${name} is violated`);
    t.diagnostic(`${name}: ${landed}`);
  }

  for (const name of experimentalInRuleset) {
    const landed = bucketOf(name);

    assert.ok(
      landed,
      `${name} is in no bucket, so the rules override stopped forcing it on; axe leaves every experimental rule out of tag selection, and without the override this gate silently shrinks`,
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
  const { results } = await fetched("/readme-table", "dark");

  assert.deepStrictEqual(
    results.violations.map((rule) => rule.id),
    [],
    report(results.violations),
  );

  for (const name of ["table-fake-caption", "td-has-header"]) {
    const passed = results.passes.find((rule) => rule.id === name);

    assert.ok(
      passed && passed.nodes.length > 0,
      `${name} evaluated no table, so forcing it on buys nothing; the fixture stopped rendering a table, or markdown-it stopped emitting one`,
    );
    t.diagnostic(`${name} passed on ${passed.nodes.length} table`);
  }
});

test("axe reports a planted failure", async () => {
  const { results } = await fetched("/planted-failures", "light", null);
  const found = results.violations;

  for (const rule of ["html-has-lang", "image-alt", "color-contrast"]) {
    assert.ok(
      found.some((violation) => violation.id === rule),
      `axe did not report ${rule}, so a clean gallery run proves nothing:\n${report(found)}`,
    );
  }
});

test("axe reports a planted accessible name mismatch", async () => {
  const { results } = await fetched("/planted-name-mismatch", "light", null);
  const found = results.violations;

  assert.ok(
    found.some((violation) => violation.id === "label-content-name-mismatch"),
    `a button labeled "Close" over the words "Save changes" went unreported, so the rules override isn't reaching axe:\n${report(found)}`,
  );
});

// each plant is only a failure under the scheme that selects its block,
// so asserting the other scheme stays clean is what pins colorScheme as a
// live input: hardcode the loop to one value and this half stops holding
test("axe reads the gallery's own stylesheet, in both palettes", async () => {
  const planted = [
    {
      palette: "dark",
      from: "\n  --ink: #f2f4f4;",
      to: "\n  --ink: #1a1c1c;",
    },
    {
      palette: "light",
      from: "\n    --ink: #0e0f0f;",
      to: "\n    --ink: #eceeee;",
    },
  ] as const;

  for (const { palette, from, to } of planted) {
    assert.strictEqual(
      galleryCss.split(from).length,
      2,
      `the ${palette} --ink declaration is no longer unique in the stylesheet, so the control moves the wrong token or none`,
    );

    const doctored = galleryCss.replace(from, to);
    const other = palette === "dark" ? "light" : "dark";

    const hit = await galleryOn(doctored, palette, `${palette} plant`);
    assert.ok(
      hit.results.violations.some((rule) => rule.id === "color-contrast"),
      `a ${palette} token moved onto its own ground went unreported, so this palette's half of the gate is measuring a bare document:\n${report(hit.results.violations)}`,
    );

    const clear = await galleryOn(
      doctored,
      other,
      `${palette} plant, ${other}`,
    );
    assert.deepStrictEqual(
      clear.results.violations.map((rule) => rule.id),
      [],
      `the ${palette} plant also failed under colorScheme ${other}, so the two paths are not selecting different blocks and the loop's scheme is doing nothing`,
    );
  }
});

// the font assertion above every audit is only worth its runtime if it
// fails on the document that lost its stylesheet, which is the shape
// page.setContent produced for every gallery audit before this wave
test("the font check bites on a document with no stylesheet", async () => {
  fixtures["/no-stylesheet"] = galleryDocument("/absent.css");

  await assert.rejects(
    () => fetched("/no-stylesheet", "dark"),
    /measured a fallback face/,
    "a gallery whose stylesheet 404s passed the font check, so document.fonts.check alone is being trusted and it answers true for a family with no face at all",
  );
});

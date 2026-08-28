// SPDX-License-Identifier: AGPL-3.0-or-later

// style-src 'self' drops an inline <style> block and a style attribute
// alike, and page.setContent applies no CSP at all — so every check here
// loads over http with the app's own header on the response

import assert from "node:assert";
import { after, before, test } from "node:test";

import { type Browser, chromium } from "playwright";

import { html } from "../../src/html/index.js";
import { page } from "../../src/html/page.js";
import { styleHref, stylesheet } from "../../src/html/styles.js";
import { wordmark } from "../../src/repos/wordmark.js";
import { indexDocument } from "../gallery/repo-index.js";
import { type Served, serve } from "../support/serve.js";

declare const document: {
  styleSheets: { href: string | null }[];
  documentElement: object;
  querySelector(selector: string): SvgLike | null;
  createElementNS(namespace: string, name: string): SvgLike;
  fonts: { ready: Promise<unknown> };
};
declare function getComputedStyle(element: object): {
  fontFamily: string;
  fontSize: string;
  color: string;
  fontWeight: string;
  fontStretch: string;
  fontVariationSettings: string;
  textDecorationLine: string;
  getPropertyValue(name: string): string;
};
type SvgLike = {
  textContent: string;
  appendChild(child: SvgLike): void;
  removeAttribute(name: string): void;
  getComputedTextLength(): number;
};

const svgNamespace = "http://www.w3.org/2000/svg";
const mark = wordmark("linklater");
const axes = mark.value.match(/font-weight="(\d+)" font-stretch="(\d+)%"/);

const marked = page({
  title: "Càrn",
  main: html`<h1 class="t-label">Repositories</h1>
<span id="generated">${mark}</span>`,
});

const unfixed = marked
  .replace(
    /font-weight="\d+" font-stretch="\d+%"/,
    `style="font-variation-settings: 'wdth' ${axes?.[2]}, 'wght' ${axes?.[1]}"`,
  )
  .replace(
    "<title>Càrn</title>",
    "<title>Càrn</title>\n<style>\nh1 { color: rgb(1, 2, 3) }\n</style>",
  )
  .replace(
    '<h1 class="t-label">',
    '<h1 class="t-label" style="color: rgb(4, 5, 6)">',
  );

let browser: Browser;
let site: Served;

before(async () => {
  browser = await chromium.launch();
  site = await serve({
    documents: {
      "/": indexDocument(),
      "/dark": indexDocument(),
      "/light": indexDocument(),
      "/marked": marked,
      "/unfixed": unfixed,
    },
  });
});

after(async () => {
  await browser?.close();
  await site?.close();
});

async function open(path: string) {
  const tab = await browser.newPage();
  const refused: string[] = [];

  tab.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) {
      refused.push(message.text().slice(0, 80));
    }
  });

  await tab.goto(`${site.origin}${path}`);
  await tab.evaluate(() => document.fonts.ready);

  return { tab, refused };
}

// the mark's <text> is in <defs> and measures nothing; probe the root
async function advances(tab: Awaited<ReturnType<Browser["newPage"]>>) {
  return tab.evaluate((namespace) => {
    const svg = document.querySelector("#generated svg");
    if (svg === null) throw new Error("the generated mark is missing");

    const probe = document.createElementNS(namespace, "text");
    probe.textContent = "linklater";
    svg.appendChild(probe);

    const style = getComputedStyle(svg);
    const reading = {
      weight: style.fontWeight,
      stretch: style.fontStretch,
      variations: style.fontVariationSettings,
      generated: probe.getComputedTextLength(),
      control: 0,
    };

    svg.removeAttribute("font-weight");
    svg.removeAttribute("font-stretch");
    reading.control = probe.getComputedTextLength();

    return reading;
  }, svgNamespace);
}

test("the stylesheet arrives as a route and applies under the real CSP", async () => {
  const { tab, refused } = await open("/");

  const state = await tab.evaluate(() => ({
    sheets: Array.from(document.styleSheets, (sheet) => sheet.href),
    fontFamily: getComputedStyle(document.querySelector("h1") as object)
      .fontFamily,
    fontSize: getComputedStyle(document.querySelector("h1") as object).fontSize,
  }));
  await tab.close();

  assert.deepStrictEqual(refused, [], "the page tripped its own CSP");
  assert.strictEqual(state.sheets.length, 1);
  assert.ok(
    String(state.sheets[0]).endsWith(styleHref),
    `the only stylesheet is ${state.sheets[0]}, not the served route`,
  );
  assert.match(state.fontFamily, /^"Carn Mono"/);
  assert.strictEqual(state.fontSize, "11px");
});

// axe misses it: the UA blue differs from the ink, so the rule passes
test("the footer's source link takes the accent and keeps its underline", async () => {
  for (const theme of ["dark", "light"] as const) {
    const { tab } = await open(`/${theme}`);
    const link = await tab.evaluate(() => {
      const anchor = document.querySelector("footer a");
      if (anchor === null) throw new Error("the footer has no source link");

      const style = getComputedStyle(anchor);
      return {
        color: style.color,
        decoration: style.textDecorationLine,
        accent: getComputedStyle(document.documentElement)
          .getPropertyValue("--accent-text")
          .trim(),
      };
    });
    await tab.close();

    const [, red, green, blue] =
      link.accent.match(/^#(..)(..)(..)$/) ?? ([] as string[]);
    assert.ok(red, `--accent-text resolved to ${link.accent} in ${theme}`);

    assert.strictEqual(
      link.color,
      `rgb(${Number.parseInt(red, 16)}, ${Number.parseInt(green as string, 16)}, ${Number.parseInt(blue as string, 16)})`,
      `the ${theme} source link is not --accent-text, so prose links sit at the browser's own blue`,
    );
    assert.strictEqual(
      link.decoration,
      "underline",
      `the ${theme} source link lost its underline, which is colour as the only signal`,
    );
  }
});

test("the served page carries no inline style for the CSP to drop", async () => {
  const body = await (await fetch(`${site.origin}/`)).text();

  assert.doesNotMatch(body, / style=/i);
  assert.doesNotMatch(body, /<style[ >]/i);
  assert.doesNotMatch(body, /<script/i);
  assert.ok(body.includes(`href="${styleHref}"`));
});

test("the stylesheet route is immutable, and its URL carries its own hash", async () => {
  const served = await (await fetch(`${site.origin}${styleHref}`)).text();

  assert.match(styleHref, /^\/carn\.[0-9a-f]{16}\.css$/);
  assert.ok(served.startsWith(stylesheet));
  assert.match(
    served,
    /\.mark \{[^}]*font-variation-settings: normal/,
    "the mark's axis reset never reaches the browser",
  );
});

test("the generated wordmark drives its axes without a style attribute", async () => {
  assert.ok(axes, "the mark no longer carries font-weight and font-stretch");
  assert.doesNotMatch(mark.value, / style=/);

  const { tab, refused } = await open("/marked");
  const measured = await advances(tab);
  await tab.close();

  assert.deepStrictEqual(refused, []);
  assert.strictEqual(measured.weight, axes[1]);
  assert.strictEqual(measured.stretch, `${axes[2]}%`);
  assert.strictEqual(
    measured.variations,
    "normal",
    "body's inherited font-variation-settings still outranks the mark's presentation attributes, so the axes are back at 400 and 100",
  );
  assert.ok(
    measured.generated > measured.control,
    `the mark at ${axes[1]}/${axes[2]} advances ${measured.generated} against the 400/100 control's ${measured.control} — the axes are not reaching the font`,
  );
});

test("the harness bites: the pre-fix document loses all three inline styles", async () => {
  const { tab, refused } = await open("/unfixed");
  const measured = await advances(tab);
  const dropped = await tab.evaluate(() => ({
    sheets: document.styleSheets.length,
    heading: getComputedStyle(document.querySelector("h1") as object).color,
  }));
  await tab.close();

  assert.ok(
    refused.length >= 1,
    "a document carrying a <style> block and a style attribute drew no CSP refusal, so the fixture server is not sending the header",
  );
  assert.strictEqual(
    dropped.sheets,
    1,
    "the inline <style> block loaded, so style-src is not what it was measured to be",
  );
  assert.notStrictEqual(
    dropped.heading,
    "rgb(4, 5, 6)",
    "the style attribute applied, so style-src is not what it was measured to be",
  );
  assert.strictEqual(
    measured.generated,
    measured.control,
    "the pre-fix mark rendered at its own axes, so the defect this wave fixed was never real",
  );
});

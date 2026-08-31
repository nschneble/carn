// SPDX-License-Identifier: AGPL-3.0-or-later

// the axe run only proves nothing went undecided; this is what proves the
// block is right. `.src` sets an explicit color, so a class nobody styled
// inherits --ink rather than a UA default — but a class nobody styled on
// purpose and a class misspelled in a selector look identical on screen

import assert from "node:assert";
import { test } from "node:test";

import { source } from "../../src/html/styles.js";

// highlight.js 11's documented class reference, by section, plus the
// classes a dotted scope splits into: title.function emits both
const documented = [
  "hljs-addition",
  "hljs-attr",
  "hljs-attribute",
  "hljs-built_in",
  "hljs-bullet",
  "hljs-char",
  "hljs-class",
  "hljs-code",
  "hljs-comment",
  "hljs-constant",
  "hljs-deletion",
  "hljs-dispatch",
  "hljs-doctag",
  "hljs-emphasis",
  "hljs-escape",
  "hljs-formula",
  "hljs-function",
  "hljs-inherited",
  "hljs-invoke",
  "hljs-keyword",
  "hljs-language",
  "hljs-link",
  "hljs-literal",
  "hljs-meta",
  "hljs-meta-prompt",
  "hljs-name",
  "hljs-number",
  "hljs-operator",
  "hljs-params",
  "hljs-property",
  "hljs-punctuation",
  "hljs-quote",
  "hljs-regexp",
  "hljs-section",
  "hljs-selector-attr",
  "hljs-selector-class",
  "hljs-selector-id",
  "hljs-selector-pseudo",
  "hljs-selector-tag",
  "hljs-string",
  "hljs-strong",
  "hljs-subst",
  "hljs-symbol",
  "hljs-tag",
  "hljs-template-tag",
  "hljs-template-variable",
  "hljs-title",
  "hljs-type",
  "hljs-variable",
];

// deliberately unstyled: each takes .src's own --ink, or the color of the
// styled class its dotted scope splits alongside, so a rule for one would
// cost bytes and say nothing
const inheritsDefault = [
  "hljs-class",
  "hljs-constant",
  "hljs-dispatch",
  "hljs-escape",
  "hljs-function",
  "hljs-inherited",
  "hljs-invoke",
  "hljs-language",
  "hljs-operator",
  "hljs-params",
  "hljs-property",
  "hljs-punctuation",
  "hljs-subst",
];

const permitted = ["--ink", "--ink-soft", "--ink-mid", "--accent-text"];

type Rule = { selectors: string[]; body: string };

function rules(css: string): Rule[] {
  const found: Rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  const bare = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

  for (const match of bare.matchAll(pattern)) {
    found.push({
      selectors: (match[1] as string)
        .split(",")
        .map((selector) => selector.trim())
        .filter((selector) => selector !== ""),
      body: match[2] as string,
    });
  }

  return found;
}

const parsed = rules(source);

// the value as written rather than the token inside it, so a literal is
// something to fail on and not something that reads as no declaration
function colorOf(body: string): string | null {
  const declared = /(?:^|;)\s*color:\s*([^;]+?)\s*(?:;|$)/.exec(body);
  return declared === null ? null : (declared[1] as string);
}

function tokenOf(value: string | null): string | null {
  if (value === null) return null;
  return /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1] ?? null;
}

function auditedColors(found: Rule[]): Map<string, string> {
  const seen = new Map<string, string>();

  for (const rule of found) {
    const value = colorOf(rule.body);

    for (const selector of rule.selectors) {
      const name = /^\.(hljs-[a-z_-]+)$/.exec(selector)?.[1];
      if (name === undefined) continue;

      assert.ok(
        !seen.has(name),
        `${name} is colored in two places, so which one wins is a question of order`,
      );

      if (value === null) continue;

      const token = tokenOf(value);
      assert.ok(
        token !== null && permitted.includes(token),
        `.${name} draws ${value}, and the block's palette is ${permitted.join(", ")}`,
      );
      seen.set(name, token);
    }
  }

  return seen;
}

test("the source block is parseable and non-trivial", () => {
  assert.ok(parsed.length > 5, "the .src block parsed to almost nothing");

  const block = parsed.find((rule) => rule.selectors.includes(".src"));
  assert.ok(block, ".src is not declared");
  assert.strictEqual(
    tokenOf(colorOf(block.body)),
    "--ink",
    ".src sets no explicit color, so an unstyled hljs class falls to the UA default",
  );
});

test("every hljs class the sheet colors resolves to one of four tokens", () => {
  assert.ok(
    auditedColors(parsed).size > 0,
    "the block colors no hljs class at all",
  );
});

// a hardcoded value used to read as no declaration at all and be skipped,
// which is the shape an out-of-palette color would have shipped in
test("a color outside the four tokens fails rather than going unread", () => {
  for (const planted of [
    "color: #ff0000",
    "color: rgb(255 0 0)",
    "color: var(--ink-faint)",
  ]) {
    assert.throws(
      () => auditedColors(rules(`.hljs-keyword { ${planted}; }`)),
      /hljs-keyword draws/,
      `${planted} went unreported, so the check is measuring fewer rules than it looks like`,
    );
  }
});

// --accent measures 4.10:1 in light on the ground and code text owes 4.5;
// --ink-faint clears dark by 0.0001, which is no headroom for a whole file
test("the two banned tokens appear nowhere in the source block", () => {
  assert.doesNotMatch(
    source,
    /var\(--accent\)/,
    "--accent fails 4.5:1 in light at code text size",
  );
  assert.doesNotMatch(
    source,
    /var\(--ink-faint\)/,
    "--ink-faint clears dark's sunk by nothing worth spending on a page of code",
  );
});

test("every selector in the block names a real highlight.js class", () => {
  const known = new Set(documented);

  for (const rule of parsed) {
    for (const selector of rule.selectors) {
      const name = /^\.(hljs-[a-z_-]+)$/.exec(selector)?.[1];
      if (name === undefined) continue;

      assert.ok(
        known.has(name),
        `.${name} is styled but highlight.js never emits it, so the rule is dead`,
      );
    }
  }
});

test("every documented class is styled or listed as inheriting the default", () => {
  const styled = new Set<string>();

  for (const rule of parsed) {
    for (const selector of rule.selectors) {
      const name = /^\.(hljs-[a-z_-]+)$/.exec(selector)?.[1];
      if (name !== undefined) styled.add(name);
    }
  }

  const unaccounted = documented.filter(
    (name) => !styled.has(name) && !inheritsDefault.includes(name),
  );

  assert.deepStrictEqual(
    unaccounted,
    [],
    `these classes are neither styled nor declared to inherit --ink, so nobody decided what they look like:\n${unaccounted.join("\n")}`,
  );

  for (const name of inheritsDefault) {
    assert.ok(
      !styled.has(name),
      `${name} is listed as inheriting the default but also has a rule`,
    );
  }
});

// the keyword group is the one that must survive grayscale and forced
// colors, where every one of the four tokens collapses to CanvasText
test("the keyword group carries a weight as well as a color", () => {
  const keywords = parsed.find(
    (rule) =>
      rule.selectors.includes(".hljs-keyword") &&
      tokenOf(colorOf(rule.body)) === "--accent-text",
  );

  assert.ok(keywords, ".hljs-keyword no longer draws --accent-text");
  assert.match(keywords.body, /font-weight:\s*500/);
});

test("forced colors keeps the block's boundary", () => {
  const forced = source.slice(source.indexOf("@media (forced-colors: active)"));

  assert.ok(forced.includes("@media"), "the block has no forced-colors rule");
  assert.match(forced, /\.src\s*\{[^}]*border-color:\s*CanvasText/);
});

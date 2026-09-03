// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import { components, stylesheet, tokens } from "../../src/html/styles.js";
import { commitDocument } from "../gallery/commit.js";
import { logDocument } from "../gallery/commit-log.js";
import { refsDocument } from "../gallery/refs.js";
import { indexDocument } from "../gallery/repo-index.js";
import { treeDocument } from "../gallery/tree.js";
import { displayOverrides, tableTargets } from "../support/table-display.js";
import {
  brand,
  dark,
  fences,
  light,
  lightBlock,
  lightQuery,
  palettes,
} from "../support/tokens.js";

const grounds = ["--ground", "--surface", "--sunk"] as const;

// every table the product serves, so no class reaching one goes unread
const servedTables = [
  treeDocument(),
  refsDocument(),
  indexDocument(),
  logDocument(),
  commitDocument(),
];

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  assert.ok(match, `${hex} is not a six-digit hex color`);
  const digits = match[1] as string;
  const [red, green, blue] = [0, 2, 4].map((offset) =>
    channel(Number.parseInt(digits.slice(offset, offset + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(one: string, other: string): number {
  const [lighter, darker] = [luminance(one), luminance(other)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

function color(palette: Map<string, string>, name: string): string {
  const value = palette.get(name);
  assert.ok(value, `${name} is undeclared`);
  return value;
}

test("BRAND.md's token block is in the stylesheet verbatim", () => {
  const [tokenFence, componentFence] = fences(brand);
  assert.ok(tokenFence, "BRAND.md has no token fence");
  assert.ok(componentFence, "BRAND.md has no component fence");

  assert.strictEqual(tokenFence, tokens);
  assert.strictEqual(
    componentFence,
    components,
    "a rule was added inside the component block instead of after it",
  );
  assert.ok(
    stylesheet.includes(tokenFence),
    "the stylesheet has drifted from BRAND.md's token block",
  );
  assert.ok(
    stylesheet.includes(componentFence),
    "the stylesheet has drifted from BRAND.md's component block",
  );
});

// dark on the bare :root, light inside the query; a color declared only
// inside a media query is empty wherever the query doesn't match, and dark
// is the default, so it's the one that vanishes
test("both palettes are complete, and only light lives in the query", () => {
  assert.strictEqual(
    tokens.indexOf(lightQuery),
    tokens.lastIndexOf(lightQuery),
    "the light palette is declared in more than one place",
  );

  const bare = tokens.replace(`${lightBlock}\n}`, "");
  assert.doesNotMatch(bare, /prefers-color-scheme/);
  assert.match(bare, /^:root \{\n {2}color-scheme: dark;/m);

  assert.deepStrictEqual([...light.keys()].sort(), [...dark.keys()].sort());

  for (const [name, palette] of palettes) {
    for (const token of palette.keys()) {
      if (/^--(f-|s[1-9]$|measure$)/.test(token)) continue;
      assert.match(
        color(palette, token),
        /^#[0-9a-f]{6}$/,
        `${name} ${token} did not resolve to a hex color`,
      );
    }
  }

  assert.strictEqual(color(dark, "--accent-fill"), color(dark, "--accent"));
  assert.strictEqual(
    color(light, "--accent-fill"),
    color(light, "--accent-text"),
  );
});

test("every ink token clears AA on ground, surface, and sunk", () => {
  for (const [name, palette] of palettes) {
    for (const ink of ["--ink", "--ink-soft", "--ink-mid", "--ink-faint"]) {
      for (const ground of grounds) {
        const measured = contrast(color(palette, ink), color(palette, ground));
        assert.ok(
          measured >= 4.5,
          `${name} ${ink} on ${ground} is ${measured.toFixed(2)}:1, under 4.5`,
        );
      }
    }
  }
});

// diff text only ever renders on .src's --sunk background, so that is the
// binding ground — not ground or surface, which the diff never sits on
test("the diff tokens clear AA against --sunk, the ground they render on", () => {
  for (const [name, palette] of palettes) {
    for (const token of ["--diff-add", "--diff-del"]) {
      const measured = contrast(
        color(palette, token),
        color(palette, "--sunk"),
      );

      assert.ok(
        measured >= 4.5,
        `${name} ${token} on --sunk is ${measured.toFixed(2)}:1, under 4.5`,
      );
    }
  }
});

test("the accent pair clears its own threshold on all three grounds", () => {
  for (const [name, palette] of palettes) {
    for (const ground of grounds) {
      const large = contrast(
        color(palette, "--accent"),
        color(palette, ground),
      );

      assert.ok(
        large >= 3,
        `${name} --accent on ${ground} is ${large.toFixed(2)}:1, under 3`,
      );

      const small = contrast(
        color(palette, "--accent-text"),
        color(palette, ground),
      );

      assert.ok(
        small >= 4.5,
        `${name} --accent-text on ${ground} is ${small.toFixed(2)}:1, under 4.5`,
      );
    }
  }
});

test("a label on a fill clears AA, and the fill's edge clears 3:1", () => {
  for (const [name, palette] of palettes) {
    const fill = color(palette, "--accent-fill");
    const label = contrast(color(palette, "--on-accent"), fill);
    assert.ok(
      label >= 4.5,
      `${name} --on-accent on --accent-fill is ${label.toFixed(2)}:1`,
    );

    for (const ground of grounds) {
      const edge = contrast(fill, color(palette, ground));
      assert.ok(
        edge >= 3,
        `${name} --accent-fill against ${ground} is ${edge.toFixed(2)}:1`,
      );
    }
  }
});

test("a component's only boundary clears 3:1 and --rule does not", () => {
  for (const [name, palette] of palettes) {
    for (const ground of grounds) {
      const border = contrast(
        color(palette, "--ink-mid"),
        color(palette, ground),
      );

      assert.ok(
        border >= 3,
        `${name} --ink-mid against ${ground} is ${border.toFixed(2)}:1`,
      );

      const hairline = contrast(
        color(palette, "--rule"),
        color(palette, ground),
      );

      assert.ok(
        hairline < 3,
        `${name} --rule now clears 3:1 against ${ground}; use it for boundaries`,
      );
    }
  }
});

// contrast() also measures luminance separation between two foreground
// tokens, not just a token against a ground — greyscale collapses hue, so
// this is what keeps added and removed apart once color is gone
test("the diff tokens are separable in greyscale, not just by hue", () => {
  for (const [name, palette] of palettes) {
    const separation = contrast(
      color(palette, "--diff-add"),
      color(palette, "--diff-del"),
    );
    assert.ok(
      separation >= 1.8,
      `${name} --diff-add and --diff-del are ${separation.toFixed(2)}:1 apart in greyscale, under 1.8`,
    );
  }
});

test("the retired diff-del values would still fail the separation check", () => {
  const retired = [
    ["dark --diff-del", "#ffa070", color(dark, "--diff-add")],
    ["light --diff-del", "#7a2900", color(light, "--diff-add")],
  ] as const;

  for (const [name, hex, add] of retired) {
    const measured = contrast(hex, add);
    assert.ok(
      measured < 1.8,
      `${name} ${hex} separates from --diff-add by ${measured.toFixed(2)}:1 — it is no longer a failure`,
    );
  }
});

test("the retired ink values would still fail, so the check discriminates", () => {
  const retired = [
    ["dark --ink-faint", "#6a7070", color(dark, "--sunk")],
    ["light --ink-mid", "#6e7473", color(light, "--sunk")],
    ["light --ink-faint", "#9aa0a0", color(light, "--sunk")],
  ] as const;

  for (const [name, hex, ground] of retired) {
    const measured = contrast(hex, ground);
    assert.ok(
      measured < 4.5,
      `${name} ${hex} measures ${measured.toFixed(2)}:1 — it is no longer a failure`,
    );
  }
});

function rule(opener: string): string {
  const start = components.indexOf(`${opener} {`);
  assert.notStrictEqual(start, -1, `${opener} is missing`);
  const end = components.indexOf("}", start);
  return components.slice(start, end);
}

test("each primitive draws from the token the contrast check measured", () => {
  assert.match(rule(".field .box"), /border: 1px solid var\(--ink-mid\);/);
  assert.match(rule(".field .box::placeholder"), /color: var\(--ink-faint\);/);
  assert.match(rule(".chip"), /border: 1px solid var\(--ink-mid\);/);

  for (const filled of [".btn", ".tag"]) {
    assert.match(rule(filled), /background: var\(--accent-fill\);/);
    assert.match(rule(filled), /border: 1px solid var\(--accent-fill\);/);
  }

  assert.match(rule(".chip--current"), /background: var\(--accent-fill\);/);
  assert.match(
    rule(".chip--current"),
    /border: 2px solid var\(--accent-fill\);/,
  );
  assert.match(rule(".tbl .is-dir .nm > *"), /color: var\(--accent-text\);/);

  assert.match(rule(":focus-visible"), /outline: 2px solid var\(--accent\);/);
  assert.match(rule(":focus-visible"), /outline-offset: 2px;/);
  assert.match(rule(".tbl .nm a:focus-visible"), /outline-offset: -2px;/);
  assert.doesNotMatch(stylesheet, /outline:\s*none/);
});

test("the button's hover brightening does not cost it AA", () => {
  const factor = rule(".btn:hover").match(/filter: brightness\(([\d.]+)\)/);
  assert.ok(factor, ".btn:hover no longer brightens");

  for (const [name, palette] of palettes) {
    const fill = color(palette, "--accent-fill").slice(1);
    const brightened = `#${[0, 2, 4]
      .map((offset) =>
        Math.min(
          255,
          Math.round(
            Number.parseInt(fill.slice(offset, offset + 2), 16) *
              Number(factor[1]),
          ),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;

    const measured = contrast(color(palette, "--on-accent"), brightened);
    assert.ok(
      measured >= 4.5,
      `${name} .btn:hover is ${measured.toFixed(2)}:1, under 4.5`,
    );
  }
});

test("a state signal survives the accent being discarded", () => {
  const current = rule(".chip--current");
  assert.match(current, /border: 2px solid/);
  assert.match(current, /font-weight: 500;/);

  const unavailable = rule('.btn[aria-disabled="true"]');
  assert.match(unavailable, /border: 1px dashed/);
  assert.match(rule('.btn[aria-disabled="true"] .chev'), /display: none;/);

  const forced = components.slice(
    components.indexOf("@media (forced-colors: active)"),
  );
  for (const selector of [
    ":focus-visible",
    ".btn",
    '.btn[aria-disabled="true"]',
    ".tag",
    ".chip--current",
  ]) {
    assert.ok(forced.includes(selector), `forced-colors ignores ${selector}`);
  }

  assert.doesNotMatch(stylesheet, /content:\s*"\//);
});

// authored, not computed: the ban is what keeps the native semantics, but
// <caption class="vh"> is out of flow and a ua blockifies an absolutely
// positioned box whatever the sheet asked for. chromium keeps role=caption
// through it, so what this reads is the ban a stylesheet can break
test("no table element carries an authored display override", () => {
  const targets = tableTargets(...servedTables);

  assert.ok(
    targets.classes.has("tbl") && targets.classes.has("row"),
    "the markup sample carries no table, so the sheet is judged against nothing",
  );

  assert.deepStrictEqual(
    displayOverrides(stylesheet, targets),
    [],
    "the stylesheet sets a display value on a table element",
  );

  // the class form is the one a type-only reader missed, and the shape .row
  // was until this wave deleted it
  for (const planted of [
    ".tbl tbody td { display: grid; }",
    ".tbl { display: block; }",
    ".row { display: grid; }",
    ".tbl .msg { display: flex; }",
  ]) {
    assert.deepStrictEqual(
      displayOverrides(planted, targets).length,
      1,
      `the reader missed ${planted}, so a clean sheet proves nothing`,
    );
  }

  assert.deepStrictEqual(
    displayOverrides(".btn { display: flex; }", targets),
    [],
    "the reader flags a class that sits on no table element",
  );
});

// two shapes, and which one a view takes is decided by its links: three
// links cannot share one overlay, and one link should not hold a third
test("the hit area covers the row, by overlay or by cell", () => {
  assert.match(rule(".tbl"), /table-layout: fixed;/);
  assert.match(
    rule(".tbl tbody th > *,\n.tbl tbody td > *"),
    /display: block;/,
  );
  assert.match(
    rule(".tbl tbody th > *,\n.tbl tbody td > *"),
    /min-height: 24px;/,
  );
  assert.match(
    rule(".tbl tbody tr:hover,\n.tbl tbody tr:focus-within"),
    /background: var\(--sunk\);/,
  );

  assert.match(
    rule(
      ".tree tbody .nm a::after,\n.repos tbody .nm a::after,\n.files tbody .nm a::after",
    ),
    /position: absolute;\n {2}inset: 0;/,
  );
  assert.match(
    rule(".tree tbody tr,\n.repos tbody tr,\n.files tbody tr"),
    /position: relative;/,
  );
  assert.deepStrictEqual(
    [...stylesheet.matchAll(/^.*::after/gm)].map(([one]) => one.trim()).sort(),
    [
      ".files tbody .nm a::after",
      ".repos tbody .nm a::after",
      ".tree tbody .nm a::after",
    ],
    "a view with three links to keep apart grew a row overlay",
  );
});

test("BRAND.md's stated ratios are the measured ones", () => {
  const stated = [
    ...brand.matchAll(
      /^- `(--[a-z-]+)` — (#[0-9A-F]{6}) · ([\d.]+):1 on ground, ([\d.]+):1 on sunk$/gm,
    ),
  ];
  assert.strictEqual(
    stated.length,
    12,
    "expected six annotated tokens per theme",
  );

  for (const [, token, hex, onGround, onSunk] of stated) {
    const palette = [dark, light].find(
      (candidate) =>
        color(candidate, token as string).toLowerCase() ===
        (hex as string).toLowerCase(),
    );
    assert.ok(palette, `${token} ${hex} matches neither theme's token block`);

    assert.strictEqual(
      contrast(hex as string, color(palette, "--ground")).toFixed(2),
      onGround,
      `${token} on ground`,
    );
    assert.strictEqual(
      contrast(hex as string, color(palette, "--sunk")).toFixed(2),
      onSunk,
      `${token} on sunk`,
    );
  }
});

test("the token block's own accent annotations are the measured ones", () => {
  const annotated = [
    ...tokens.matchAll(
      /--(accent(?:-text)?): (#[0-9a-f]{6}); \/\* ([\d.]+):1 on ground, ([\d.]+) on sunk/g,
    ),
  ];
  assert.strictEqual(annotated.length, 2);

  for (const [, , hex, onGround, onSunk] of annotated) {
    assert.strictEqual(
      contrast(hex as string, color(dark, "--ground")).toFixed(2),
      onGround,
    );
    assert.strictEqual(
      contrast(hex as string, color(dark, "--sunk")).toFixed(2),
      onSunk,
    );
  }
});

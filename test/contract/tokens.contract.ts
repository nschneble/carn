// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { components, stylesheet, tokens } from "../../src/html/styles.js";

const root = resolve(import.meta.dirname, "../../..");
const brand = readFileSync(join(root, "docs/BRAND.md"), "utf8");

const grounds = ["--ground", "--surface", "--sunk"] as const;

function fences(document: string): string[] {
  return [...document.matchAll(/```css\n([\s\S]*?)\n```/g)].map(
    (match) => match[1] as string,
  );
}

function declarations(css: string, selector: string): Map<string, string> {
  const opener = new RegExp(
    `^[ ]*${selector.replaceAll(/[[\](){}.*+?^$|\\]/g, "\\$&")} \\{$`,
    "gm",
  );
  const openings = [...css.matchAll(opener)];
  assert.strictEqual(openings.length, 1, `${selector} is not declared once`);

  const opening = openings[0] as RegExpExecArray;
  const start = (opening.index as number) + opening[0].length;
  const end = css.indexOf("}", start);
  assert.notStrictEqual(end, -1, `${selector} is unterminated`);

  const found = new Map<string, string>();
  for (const line of css.slice(start, end).split("\n")) {
    const match = line.match(
      /^\s*(--[a-z0-9-]+):\s*([^;]+);(?:\s*\/\*[^*]*\*\/)?\s*$/,
    );
    if (match) found.set(match[1] as string, match[2] as string);
  }
  return found;
}

function resolvePalette(overrides: Map<string, string>): Map<string, string> {
  const merged = new Map([...declarations(tokens, ":root"), ...overrides]);

  for (const [name, value] of merged) {
    const reference = value.match(/^var\((--[a-z0-9-]+)\)$/);
    if (!reference) continue;
    const target = merged.get(reference[1] as string);
    assert.ok(target, `${name} points at undeclared ${reference[1]}`);
    merged.set(name, target);
  }
  return merged;
}

const dark = resolvePalette(new Map());
const light = resolvePalette(declarations(tokens, ':root[data-theme="light"]'));
const palettes = [
  ["dark", dark],
  ["light", light],
] as const;

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  assert.ok(match, `${hex} is not a six-digit hex colour`);
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

function colour(palette: Map<string, string>, name: string): string {
  const value = palette.get(name);
  assert.ok(value, `${name} is undeclared`);
  return value;
}

test("BRAND.md's token block is in the stylesheet verbatim", () => {
  const [tokenFence, componentFence] = fences(brand);
  assert.ok(tokenFence, "BRAND.md has no token fence");
  assert.ok(componentFence, "BRAND.md has no component fence");

  assert.strictEqual(tokenFence, tokens);
  assert.ok(
    stylesheet.includes(tokenFence),
    "the stylesheet has drifted from BRAND.md's token block",
  );
  assert.ok(
    stylesheet.includes(componentFence),
    "the stylesheet has drifted from BRAND.md's component block",
  );
});

test("all three theme states resolve a complete palette", () => {
  const guarded = declarations(tokens, ':root:not([data-theme="dark"])');
  const stamped = declarations(tokens, ':root[data-theme="light"]');

  assert.deepStrictEqual(
    [...guarded.entries()].sort(),
    [...stamped.entries()].sort(),
    "the two light blocks have drifted apart",
  );

  assert.deepStrictEqual([...light.keys()].sort(), [...dark.keys()].sort());

  for (const [name, palette] of palettes) {
    for (const token of palette.keys()) {
      if (/^--(f-|s[1-9]$|measure$)/.test(token)) continue;
      assert.match(
        colour(palette, token),
        /^#[0-9a-f]{6}$/,
        `${name} ${token} did not resolve to a hex colour`,
      );
    }
  }

  assert.strictEqual(colour(dark, "--accent-fill"), colour(dark, "--accent"));
  assert.strictEqual(
    colour(light, "--accent-fill"),
    colour(light, "--accent-text"),
  );
});

test("every ink token clears AA on ground, surface, and sunk", () => {
  for (const [name, palette] of palettes) {
    for (const ink of ["--ink", "--ink-soft", "--ink-mid", "--ink-faint"]) {
      for (const ground of grounds) {
        const measured = contrast(
          colour(palette, ink),
          colour(palette, ground),
        );
        assert.ok(
          measured >= 4.5,
          `${name} ${ink} on ${ground} is ${measured.toFixed(2)}:1, under 4.5`,
        );
      }
    }
  }
});

test("the accent pair clears its own threshold on all three grounds", () => {
  for (const [name, palette] of palettes) {
    for (const ground of grounds) {
      const large = contrast(
        colour(palette, "--accent"),
        colour(palette, ground),
      );
      assert.ok(
        large >= 3,
        `${name} --accent on ${ground} is ${large.toFixed(2)}:1, under 3`,
      );

      const small = contrast(
        colour(palette, "--accent-text"),
        colour(palette, ground),
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
    const fill = colour(palette, "--accent-fill");
    const label = contrast(colour(palette, "--on-accent"), fill);
    assert.ok(
      label >= 4.5,
      `${name} --on-accent on --accent-fill is ${label.toFixed(2)}:1`,
    );

    for (const ground of grounds) {
      const edge = contrast(fill, colour(palette, ground));
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
        colour(palette, "--ink-mid"),
        colour(palette, ground),
      );
      assert.ok(
        border >= 3,
        `${name} --ink-mid against ${ground} is ${border.toFixed(2)}:1`,
      );

      const hairline = contrast(
        colour(palette, "--rule"),
        colour(palette, ground),
      );
      assert.ok(
        hairline < 3,
        `${name} --rule now clears 3:1 against ${ground}; use it for boundaries`,
      );
    }
  }
});

test("the retired ink values would still fail, so the check discriminates", () => {
  const retired = [
    ["dark --ink-faint", "#6a7070", colour(dark, "--sunk")],
    ["light --ink-mid", "#6e7473", colour(light, "--sunk")],
    ["light --ink-faint", "#9aa0a0", colour(light, "--sunk")],
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

  assert.match(rule(":focus-visible"), /outline: 2px solid var\(--accent\);/);
  assert.match(rule(":focus-visible"), /outline-offset: 2px;/);
  assert.match(rule(".row .nm:focus-visible"), /outline-offset: -2px;/);
  assert.doesNotMatch(stylesheet, /outline:\s*none/);
});

test("the button's hover brightening does not cost it AA", () => {
  const factor = rule(".btn:hover").match(/filter: brightness\(([\d.]+)\)/);
  assert.ok(factor, ".btn:hover no longer brightens");

  for (const [name, palette] of palettes) {
    const fill = colour(palette, "--accent-fill").slice(1);
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

    const measured = contrast(colour(palette, "--on-accent"), brightened);
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

test("the row's overlay leaves its two columns selectable", () => {
  assert.match(rule(".row"), /position: relative;/);
  assert.match(rule(".row .nm::after"), /content: "";/);
  assert.match(rule(".row .nm::after"), /position: absolute;/);
  assert.match(rule(".row .nm::after"), /inset: 0;/);
  assert.match(rule(".row .msg,\n.row .age"), /position: relative;/);
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
        colour(candidate, token as string).toLowerCase() ===
        (hex as string).toLowerCase(),
    );
    assert.ok(palette, `${token} ${hex} matches neither theme's token block`);

    assert.strictEqual(
      contrast(hex as string, colour(palette, "--ground")).toFixed(2),
      onGround,
      `${token} on ground`,
    );
    assert.strictEqual(
      contrast(hex as string, colour(palette, "--sunk")).toFixed(2),
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
      contrast(hex as string, colour(dark, "--ground")).toFixed(2),
      onGround,
    );
    assert.strictEqual(
      contrast(hex as string, colour(dark, "--sunk")).toFixed(2),
      onSunk,
    );
  }
});

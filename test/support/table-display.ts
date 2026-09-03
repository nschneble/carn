// SPDX-License-Identifier: AGPL-3.0-or-later

// a display value on a table element is what costs the native semantics.
// css alone cannot say which tag a class sits on, so the markup is read
// first and the sheet is judged against the classes and ids it puts on a
// table element — the shape .row was, and a type-only reader misses.
// none and table-cell are exempt: see BRAND.md 12 for why

const tableTag = "table|thead|tbody|tfoot|tr|th|td|caption";

const openingTag = new RegExp(`<(${tableTag})\\b([^>]*)>`, "gi");
const attribute = /\b(class|id)\s*=\s*"([^"]*)"/gi;

export type TableTargets = { classes: Set<string>; ids: Set<string> };

export function tableTargets(...markup: string[]): TableTargets {
  const classes = new Set<string>();
  const ids = new Set<string>();

  for (const source of markup) {
    for (const [, , attributes] of source.matchAll(openingTag)) {
      for (const [, name, value] of (attributes as string).matchAll(
        attribute,
      )) {
        const into = name === "id" ? ids : classes;
        for (const token of (value as string).split(/\s+/)) {
          if (token !== "") into.add(token);
        }
      }
    }
  }

  return { classes, ids };
}

// the last compound is where the rule lands, so > * lands on the child
function landsOnTable(compound: string, targets: TableTargets): boolean {
  if (new RegExp(`^(${tableTag})\\b`, "i").test(compound)) return true;

  for (const [, token] of compound.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
    if (targets.classes.has(token as string)) return true;
  }

  for (const [, token] of compound.matchAll(/#([A-Za-z0-9_-]+)/g)) {
    if (targets.ids.has(token as string)) return true;
  }

  return false;
}

// none takes the cell out of layout entirely, semantics and all, and
// table-cell is the value it already had. what costs the native semantics
// is a value that restyles a cell which is still there
const allowed = /^(none|table-cell)$/i;

// every declaration in the body, not just the first: a rule saying none and
// then grid is the second one, and the first would have excused it
function restyles(body: string): boolean {
  return [...body.matchAll(/display\s*:\s*([^;}]+)/gi)].some(
    ([, value]) => !allowed.test((value as string).trim()),
  );
}

export function displayOverrides(css: string, targets: TableTargets): string[] {
  const found: string[] = [];

  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!restyles(body as string)) continue;

    for (const one of (selector as string).split(",")) {
      const compound =
        one
          .trim()
          .split(/[\s>+~]+/)
          .pop() ?? "";

      if (landsOnTable(compound, targets)) found.push(one.trim());
    }
  }

  return found;
}

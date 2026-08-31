// SPDX-License-Identifier: AGPL-3.0-or-later

// the served sheet only; styles.ts stays the source BRAND.md is pinned to.
// quoted runs are copied through untouched, so a family name keeps its
// spaces and a url keeps its punctuation

const tight = new Set(["{", "}", ":", ";", ","]);

function quoted(css: string, start: number): number {
  const quote = css[start];
  let index = start + 1;

  while (index < css.length) {
    const char = css[index];
    if (char === "\\") index += 2;
    else if (char === quote) return index + 1;
    else index += 1;
  }

  return css.length;
}

export function minifyCss(css: string): string {
  let out = "";
  let index = 0;

  while (index < css.length) {
    const char = css[index] as string;

    if (char === '"' || char === "'") {
      const end = quoted(css, index);
      out += css.slice(index, end);
      index = end;
      continue;
    }

    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }

    if (/\s/.test(char)) {
      while (index < css.length && /\s/.test(css[index] as string)) index += 1;

      const next = css[index] ?? "";
      const previous = out.slice(-1);
      const joins =
        next !== "" && previous !== "" && previous !== " " && !tight.has(next);

      if (joins && !tight.has(previous)) out += " ";
      continue;
    }

    if (tight.has(char)) {
      while (out.endsWith(" ")) out = out.slice(0, -1);
      if (char === "}") while (out.endsWith(";")) out = out.slice(0, -1);
      out += char;
      index += 1;
      continue;
    }

    out += char;
    index += 1;
  }

  return out.trim();
}

// SPDX-License-Identifier: AGPL-3.0-or-later

// lowercase runs go in .sc spans and everything else stays at full size,
// so the DOM keeps the true filename. no whitespace between the runs: a
// newline inside README.<span>md</span> becomes a space in the accessible
// name, the clipboard, and find-in-page. BRAND.md 03

import { html, type Raw } from "./index.js";

function lowercase(char: string): boolean {
  return char.toUpperCase() !== char;
}

export function smallCaps(name: string): Raw {
  const runs: (Raw | string)[] = [];
  let index = 0;

  while (index < name.length) {
    const start = index;
    const small = lowercase(name[start] as string);

    while (index < name.length && lowercase(name[index] as string) === small) {
      index += 1;
    }

    const run = name.slice(start, index);
    runs.push(small ? html`<span class="sc">${run}</span>` : run);
  }

  return html`${runs}`;
}

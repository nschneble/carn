// SPDX-License-Identifier: AGPL-3.0-or-later

// two name kinds, two functions. both keep the true characters in the DOM
// and put nothing between the runs, since a newline there becomes a space
// in the accessible name, the clipboard, and find-in-page. BRAND.md 03

import { html, type Raw } from "./index.js";

// a path or filename: the last dot of the final segment splits it, the
// stem taking .caps at full size and the extension .sc
export function pathName(name: string): Raw {
  const segment = name.lastIndexOf("/") + 1;
  const dot = name.lastIndexOf(".");

  if (dot < segment || dot === name.length - 1) {
    return html`<span class="caps">${name}</span>`;
  }

  // a leading dot is the extension here, unlike blob-page's extensionOf
  return html`<span class="caps">${name.slice(0, dot)}<span class="sc">${name.slice(dot)}</span></span>`;
}

// a ref or repo name: no extension exists to find, so nothing is looked
// for. a tag is v1.1.0 whole and a branch's slash is a literal character
export function plainName(name: string): Raw {
  return html`<span class="caps">${name}</span>`;
}

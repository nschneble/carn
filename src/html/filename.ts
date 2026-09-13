// SPDX-License-Identifier: AGPL-3.0-or-later

// both names keep the true chars in the DOM w/ nothing in between, since a
// newline is a space in the a11y name, clipboard, and find. BRAND.md 03

import { html, type Raw } from "./index.js";

// the last dot of the final segment splits stem .caps from extension .sc
export function pathName(name: string): Raw {
  const segment = name.lastIndexOf("/") + 1;
  const dot = name.lastIndexOf(".");

  if (dot < segment || dot === name.length - 1) {
    return html`<span class="caps">${name}</span>`;
  }

  // a leading dot is the extension here, unlike blob-page's extensionOf
  return html`<span class="caps">${name.slice(0, dot)}<span class="sc">${name.slice(dot)}</span></span>`;
}

// no extension to find: v1.1.0 stays whole and a slash is a literal
export function plainName(name: string): Raw {
  return html`<span class="caps">${name}</span>`;
}

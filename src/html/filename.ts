// SPDX-License-Identifier: AGPL-3.0-or-later

// the last dot of the final segment splits a name: the stem takes .caps
// at full size, the extension .sc. the DOM keeps the true characters and
// nothing goes between the runs, since a newline there becomes a space in
// the accessible name, the clipboard, and find-in-page. BRAND.md 03

import { html, type Raw } from "./index.js";

export function smallCaps(name: string): Raw {
  const segment = name.lastIndexOf("/") + 1;
  const dot = name.lastIndexOf(".");

  if (dot < segment || dot === name.length - 1) {
    return html`<span class="caps">${name}</span>`;
  }

  // a leading dot is the extension here, unlike blob-page's extensionOf
  return html`<span class="caps">${name.slice(0, dot)}<span class="sc">${name.slice(dot)}</span></span>`;
}

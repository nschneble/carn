// SPDX-License-Identifier: AGPL-3.0-or-later

import { html, type Raw } from "./index.js";

export function emptyState(message: string, command?: string): Raw {
  const hint =
    command === undefined
      ? html``
      : html`<p><code class="t-mono">${command}</code></p>`;

  return html`<div class="empty">
        <p class="t-body">${message}</p>
        ${hint}
      </div>`;
}

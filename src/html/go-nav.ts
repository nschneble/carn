// SPDX-License-Identifier: AGPL-3.0-or-later

import { commitsHref, refsHref } from "./hrefs.js";
import { html, type Raw } from "./index.js";
import { refLabel } from "./ref-list.js";

// the log follows the rev in view; branches and tags are the repo's
export function goNav(repo: string, rev: string): Raw {
  return html`<nav class="list-nav" aria-labelledby="go-label">
      <p class="t-label" id="go-label">Go</p>
      <ul role="list">
        <li><a href="${commitsHref(repo, rev)}">Commits</a></li>
        <li><a href="${refsHref(repo, "branch")}">${refLabel("branch")}</a></li>
        <li><a href="${refsHref(repo, "tag")}">${refLabel("tag")}</a></li>
      </ul>
    </nav>`;
}

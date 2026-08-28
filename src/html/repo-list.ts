// SPDX-License-Identifier: AGPL-3.0-or-later

import type { RepoSummary } from "../repos/list.js";
import { sshRemote } from "../repos/remote.js";
import { ageMarkup } from "./age.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";

function row(repo: RepoSummary, now: Date): Raw {
  return html`<li class="row">
<a class="nm t-item" href="/r/${repo.name}">${repo.name}</a>
<span class="msg">${repo.description}</span>
${ageMarkup("Created", repo.createdAt, now)}
</li>`;
}

function empty(): Raw {
  return html`<div class="empty">
<p class="t-body">No repos yet. Every repo on this server is listed here, and pushing to a name that doesn't exist creates it.</p>
<p><code class="t-mono">git push ${sshRemote("your-repo")} main</code></p>
</div>`;
}

export function repoListPage(view: {
  repos: RepoSummary[];
  now: Date;
}): string {
  const main =
    view.repos.length === 0
      ? empty()
      : html`<ul class="repos" role="list">
${view.repos.map((repo) => row(repo, view.now))}
</ul>`;

  return page({
    title: "Càrn",
    main: html`<h1 class="t-label">Repositories</h1>
${main}`,
  });
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import type { RepoSummary } from "../repos/list.js";
import { sshRemote } from "../repos/remote.js";
import { ageCell } from "./age.js";
import { plainName } from "./filename.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";

function row(repo: RepoSummary, now: Date): Raw {
  return html`<tr class="row">
            <th class="nm" scope="row"><a class="t-item" lang="en" href="/r/${repo.name}">${plainName(repo.name)}</a></th>
            <td class="msg"><span>${repo.description}</span></td>
            ${ageCell(repo.createdAt, now)}
          </tr>`;
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
      : html`      <table class="tbl repos">
        <caption class="vh">Repositories</caption>
        <thead>
          <tr>
            <th class="nm t-label" scope="col">Name</th>
            <th class="msg t-label" scope="col">About</th>
            <th class="age t-label" scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          ${view.repos.map((repo) => row(repo, view.now))}
        </tbody>
      </table>`;

  return page({
    title: "Càrn",
    description: "Repositories",
    path: "/",
    main: html`<h1 class="t-item t-item--title">Repositories</h1>
${main}`,
  });
}

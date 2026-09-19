// SPDX-License-Identifier: AGPL-3.0-or-later

import type { RepoSummary } from "../repos/list.js";
import { sshRemote } from "../repos/remote.js";
import { age } from "./age.js";
import { emptyState } from "./empty-state.js";
import { plainName } from "./filename.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";

function row(repo: RepoSummary, now: Date): Raw {
  return html`<tr class="row">
            <th class="name" scope="row"><a class="t-item" lang="en" href="/r/${repo.name}">${plainName(repo.name)}</a></th>
            <td class="msg"><span>${repo.description || html`<em>No description</em>`}</span><span>Created <time datetime="${repo.createdAt.toISOString()}">${age(repo.createdAt, now)}</time> ago</span></td>
          </tr>`;
}

function repoListTableCaption(numRepos: number): string {
  if (numRepos === 1) return "1 Repo";

  return `${numRepos} Repos · Listed A→Z`;
}

export function repoListPage(view: {
  repos: RepoSummary[];
  now: Date;
}): string {
  const main =
    view.repos.length === 0
      ? html`      <h1 class="t-l">No repos yet</h1>
        ${emptyState(
          "Every repo on this server is listed here, and pushing to a name that doesn't exist creates it.",
          `git push ${sshRemote("your-repo")} main`,
        )}
      `
      : html`      <h1 class="vh">Repos</h1>
      <table class="tbl repos">
        <caption class="t-label">${repoListTableCaption(view.repos.length)}</caption>
        <colgroup>
          <col class="c-name" />
          <col class="c-msg" />
        </colgroup>
        <thead>
          <tr>
            <th class="name vh" scope="col">Name</th>
            <th class="vh" scope="col">Description and age</th>
          </tr>
        </thead>
        <tbody>
          ${view.repos.map((repo) => row(repo, view.now))}
        </tbody>
      </table>`;

  return page({
    title: "Càrn",
    description: "Repos",
    path: "/",
    main: html`${main}`,
  });
}

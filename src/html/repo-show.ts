// SPDX-License-Identifier: AGPL-3.0-or-later

// the only place raw() enters a page: renderMarkdown returns pre-escaped
// html and every other interpolation goes through the escaping tag

import { renderMarkdown, renderPlainText } from "../markdown/render.js";
import { headerMarkup } from "../repos/header.js";
import { headerAssetPath } from "../repos/header-asset.js";
import { sshRemote } from "../repos/remote.js";
import type { RepoView } from "../repos/show.js";
import { stamp } from "./age.js";
import { emptyState } from "./empty-state.js";
import { commitsHref, refsHref } from "./hrefs.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";
import { refLabel } from "./ref-list.js";
import { treeList } from "./tree-list.js";

function repoNav(repo: string, branch: string): Raw {
  return html`<nav class="repo-nav" aria-label="Repo views">
      <p class="t-label">Go</p>
      <ul role="list">
        <li><a href="${commitsHref(repo, branch)}">Commits</a></li>
        <li><a href="${refsHref(repo, "branch")}">${refLabel("branch")}</a></li>
        <li><a href="${refsHref(repo, "tag")}">${refLabel("tag")}</a></li>
      </ul>
    </nav>`;
}

function noCommits(view: RepoView): Raw {
  return html`      <h1 class="t-l">No commits</h1>
  ${emptyState(
    `The file tree at ${view.branch} is shown here once something is pushed to it.`,
    `git push ${sshRemote(view.name)} ${view.branch}`,
  )}
  `;
}

// a commit whose tree is empty still has history, so it isn't no commits
function emptyTree(view: RepoView): Raw {
  return emptyState(
    `Nothing at ${view.branch}. The commit it points at leaves the tree empty.`,
  );
}

function tree(view: RepoView, showAll: boolean, now: Date): Raw {
  if (view.tip === null) return noCommits(view);
  if (view.entries.length === 0) return emptyTree(view);

  return html`<h2 class="vh">Items</h2>
      ${treeList({
        repo: view.name,
        rev: view.branch,
        path: "",
        entries: view.entries,
        showAll,
        allHref: `/r/${view.name}?all=1`,
        now,
      })}`;
}

function readme(view: RepoView): Raw {
  if (view.tip === null || view.readme === null) return html``;

  return html`<div class="repo-readme">
      <div class="readme-caption" id="readme"><h2 class="t-label">README</h2></div>
      <div class="readme">

<!-- (⌐■_■) real punks don't indent their READMEs -->
${renderMarkdown(view.readme, { repo: view.name, rev: view.branch })}
      </div>
    </div>`;
}

function metaDescription(view: RepoView): string {
  return view.tip && view.readme
    ? renderPlainText(view.readme, 150)
    : (view.description ?? "");
}

function about(repo: RepoView, now: Date): Raw {
  const [verb, at] =
    repo.updatedAt === null
      ? (["Created", repo.createdAt] as const)
      : (["Updated", repo.updatedAt] as const);

  return html`<div class="about">
        <p class="t-label">
          ${repo.name} · ${repo.branch} · ${repo.license?.spdx ?? "No license"}
          <br />
          ${stamp(verb, at, now)}
        </p>
        ${repo.description ? html`<p class="t-mono">${repo.description}</p>` : html``}
      </div>
  `;
}

// the mark is decorative, so .vh carries the name as a real heading
export function repoShowPage(view: {
  repo: RepoView;
  showAll: boolean;
  now: Date;
}): string {
  const { repo } = view;

  const identity = headerMarkup({
    name: repo.name,
    header: repo.header,
    src: (image) => headerAssetPath(repo.name, image),
  });

  return page({
    title: `${repo.name} · Càrn`,
    description: `${metaDescription(repo)}`,
    path: `/r/${repo.name}`,
    main: html`<div class="repo-identity">${identity}</div>
    <h1 class="vh">${repo.name}</h1>
    <div class="repo-body">
      <div class="repo-files">
        ${about(repo, view.now)}
        ${tree(repo, view.showAll, view.now)}
      </div>
      ${repoNav(repo.name, repo.branch)}
      ${readme(repo)}
    </div>`,
  });
}

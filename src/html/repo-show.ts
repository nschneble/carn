// SPDX-License-Identifier: AGPL-3.0-or-later

// the only place raw() enters a page: renderMarkdown returns pre-escaped
// html and every other interpolation goes through the escaping tag

import { renderMarkdown, renderPlainText } from "../markdown/render.js";
import { headerMarkup } from "../repos/header.js";
import { headerAssetPath } from "../repos/header-asset.js";
import { sshRemote } from "../repos/remote.js";
import type { RepoView } from "../repos/show.js";
import { site } from "./breadcrumb.js";
import { commitsHref } from "./commit-log.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";
import { refsHref } from "./ref-list.js";
import { treeList } from "./tree-list.js";

// the hub every breadcrumb passes through: nothing else reaches these three
function repoNav(repo: string, branch: string): Raw {
  return html`<nav class="repo-nav" aria-label="Repo views">
      <ul role="list">
        <li><a href="${commitsHref(repo, branch)}">Commits</a></li>
        <li><a href="${refsHref(repo, "branch")}">Branches</a></li>
        <li><a href="${refsHref(repo, "tag")}">Tags</a></li>
      </ul>
    </nav>`;
}

function noCommits(view: RepoView): Raw {
  return html`<div class="empty">
        <p class="t-body">No commits yet. The file tree at ${view.branch} is shown here once something is pushed to it.</p>
        <p><code class="t-mono">git push ${sshRemote(view.name)} ${view.branch}</code></p>
      </div>`;
}

function tree(view: RepoView, showAll: boolean, now: Date): Raw {
  if (view.entries.length === 0) return noCommits(view);

  return html`<h2 class="t-label">Files</h2>
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

function noReadme(view: RepoView): Raw {
  return html`<div class="empty">
        <p class="t-body">No README yet. A README.md at the root of ${view.branch} is rendered here, under the file tree.</p>
        <p><code class="t-mono">git add README.md &amp;&amp; git commit -m "add README" &amp;&amp; git push</code></p>
      </div>`;
}

function readme(view: RepoView): Raw {
  if (view.tip === null) return html`<span class="vh">No README yet.</span>`;
  if (view.readme === null) return noReadme(view);

  return html`<div class="readme">

<!-- (⌐■_■) real punks don't indent their READMEs -->
${renderMarkdown(view.readme, { repo: view.name, rev: view.branch })}
      </div>`;
}

function description(view: RepoView): string {
  if (view.tip === null) return "";
  if (view.readme === null) return "No README yet.";

  return renderPlainText(view.readme, 150);
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
    description: `${description(repo)}`,
    path: `/r/${repo.name}`,
    crumbs: [site, { label: repo.name, href: null }],
    main: html`${identity}
      <h1 class="vh">${repo.name}</h1>
      ${repoNav(repo.name, repo.branch)}
      ${tree(repo, view.showAll, view.now)}
      ${readme(repo)}`,
  });
}

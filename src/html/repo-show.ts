// SPDX-License-Identifier: AGPL-3.0-or-later

// the only place raw() enters a page: renderMarkdown returns pre-escaped
// html and every other interpolation goes through the escaping tag

import { renderMarkdown, renderPlainText } from "../markdown/render.js";
import { headerMarkup } from "../repos/header.js";
import { headerAssetPath } from "../repos/header-asset.js";
import { sshRemote } from "../repos/remote.js";
import type { RepoView } from "../repos/show.js";
import type { TreeEntry } from "../repos/tree.js";
import { smallCaps } from "./filename.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";

export const treeRowCap = 16;

function row(entry: TreeEntry): Raw {
  return entry.directory
    ? html`<li class="row is-dir"><span class="nm t-item" lang="en">${smallCaps(entry.name)}/</span></li>`
    : html`<li class="row"><span class="nm t-item" lang="en">${smallCaps(entry.name)}</span></li>`;
}

function noCommits(view: RepoView): Raw {
  return html`<div class="empty">
        <p class="t-body">No commits yet. The file tree at ${view.branch} is shown here once something is pushed to it.</p>
        <p><code class="t-mono">git push ${sshRemote(view.name)} ${view.branch}</code></p>
      </div>`;
}

function tree(view: RepoView, showAll: boolean): Raw {
  if (view.entries.length === 0) return noCommits(view);

  const shown = showAll ? view.entries : view.entries.slice(0, treeRowCap);
  const list = html`<h2 class="t-label">Files</h2>
      <ul class="tree" role="list">
        ${shown.map(row)}
      </ul>`;

  if (shown.length === view.entries.length) return list;

  return html`${list}
      <p class="showall"><a class="t-mono" href="/r/${view.name}?all=1">Show all ${view.entries.length}<span aria-hidden="true"> →</span></a></p>`;
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
${renderMarkdown(view.readme)}
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
    main: html`${identity}
      <h1 class="vh">${repo.name}</h1>
      ${tree(repo, view.showAll)}
      ${readme(repo)}`,
  });
}

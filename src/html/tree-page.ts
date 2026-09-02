// SPDX-License-Identifier: AGPL-3.0-or-later

// the listing and nothing else: /r/:repo is the only page that renders a
// readme, and the only page that is the root tree

import type { Tree } from "../repos/tree.js";
import { pathTrail, repoTrail } from "./breadcrumb.js";
import { smallCaps } from "./filename.js";
import { html } from "./index.js";
import { page } from "./page.js";
import { treeHref, treeList } from "./tree-list.js";

export type TreePage = {
  repo: string;
  rev: string;
  tree: Tree;
  showAll: boolean;
  now: Date;
};

export function treePage(view: TreePage): string {
  const { repo, rev, tree } = view;
  const href = treeHref(repo, rev, tree.path);

  return page({
    title: `${tree.path} · ${repo} · Càrn`,
    description: `The files at ${tree.path} on ${rev} in ${repo}.`,
    path: href,
    crumbs: [...repoTrail(repo), ...pathTrail(repo, rev, tree.path)],
    main: html`<h1 class="t-item" lang="en">${smallCaps(tree.path)}</h1>
      ${treeList({
        repo,
        rev,
        path: tree.path,
        entries: tree.entries,
        showAll: view.showAll,
        allHref: `${href}?all=1`,
        now: view.now,
      })}`,
  });
}

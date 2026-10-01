// SPDX-License-Identifier: AGPL-3.0-or-later

// the listing and nothing else: /r/:repo is the only page that renders a
// readme, and the only page that's the root tree

import type { Tree } from "../repos/tree.js";
import { pathNav, pathTrail, revTrail } from "./breadcrumb.js";
import { treeHref } from "./hrefs.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";
import { treeList } from "./tree-list.js";

export type TreePage = {
  repo: string;
  rev: string;
  defaultBranch: string;
  tree: Tree;
  showAll: boolean;
  now: Date;
};

function treeBodyList(view: TreePage, href: string): Raw {
  const { repo, rev, tree, showAll, now } = view;
  const { path, entries } = tree;
  const allHref = `${href}?all=1`;

  return treeList({ repo, rev, path, entries, showAll, allHref, now });
}

function side(view: TreePage): Raw {
  const { repo, rev, defaultBranch, tree } = view;

  return html`<div class="page-side">
          ${pathNav([
            ...revTrail(repo, rev, defaultBranch),
            ...pathTrail(repo, rev, tree.path, "tree"),
          ])}
        </div>`;
}

export function treePage(view: TreePage): string {
  const { repo, rev, tree } = view;
  const plainAddress = [repo, rev, tree.path].join("/");
  const href = treeHref(repo, rev, tree.path);

  return page({
    title: `${plainAddress} · Càrn`,
    description: `The items at ${tree.path} on ${rev} in ${repo}.`,
    path: href,
    main: html`<h1 class="vh">${plainAddress}</h1>
      <div class="page-body">
        ${side(view)}
        <div class="page-main">
          ${treeBodyList(view, href)}
        </div>
      </div>`,
  });
}

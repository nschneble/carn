// SPDX-License-Identifier: AGPL-3.0-or-later

// one row implementation for the root tree and every tree below it. a
// gitlink is a plain row carrying its pinned sha: nothing is disabled
// because nothing was ever offered, and reading .gitmodules to link out
// would cost a cat-file and inherit markdown's scheme problem

import type { TreeEntry } from "../repos/tree.js";
import { ageMarkup } from "./age.js";
import { shortShaChars } from "./commit-log.js";
import { pathName } from "./filename.js";
import { html, type Raw } from "./index.js";

export type TreeListView = {
  repo: string;
  rev: string;
  path: string;
  entries: TreeEntry[];
  showAll: boolean;
  allHref: string;
  now: Date;
};

export const treeRowCap = 16;

// a filename can carry a #, a ?, or a space, and a ref can carry a slash
function trail(rev: string, path: string): string {
  const segments = path.split("/").map(encodeURIComponent).join("/");
  return `${encodeURIComponent(rev)}/${segments}`;
}

export function blobHref(repo: string, rev: string, path: string): string {
  return `/r/${repo}/blob/${trail(rev, path)}`;
}

export function treeHref(repo: string, rev: string, path: string): string {
  return `/r/${repo}/tree/${trail(rev, path)}`;
}

// both columns sit above the row-wide overlay, so they stay selectable
function columns(entry: TreeEntry, now: Date): Raw {
  if (entry.touched === null) {
    return html`<span class="msg"></span><span class="age"></span>`;
  }

  return html`<span class="msg">${entry.touched.subject}</span>${ageMarkup("Changed", entry.touched.at, now)}`;
}

function row(view: TreeListView, entry: TreeEntry): Raw {
  const path = view.path === "" ? entry.name : `${view.path}/${entry.name}`;

  if (entry.kind === "gitlink") {
    return html`<li class="row is-sub">
        <span class="nm t-item" lang="en">${pathName(entry.name)}<span class="t-micro"> Pinned</span></span>
        <span class="pin t-mono"><span class="vh">Submodule pinned at </span>${entry.oid.slice(0, shortShaChars)}</span>
      </li>`;
  }

  const href =
    entry.kind === "directory"
      ? treeHref(view.repo, view.rev, path)
      : blobHref(view.repo, view.rev, path);

  const name =
    entry.kind === "directory"
      ? html`${pathName(entry.name)}/`
      : pathName(entry.name);

  return html`<li class="row${entry.kind === "directory" ? " is-dir" : ""}">
        <a class="nm t-item" lang="en" href="${href}">${name}</a>
        ${columns(entry, view.now)}
      </li>`;
}

export function treeList(view: TreeListView): Raw {
  const shown = view.showAll ? view.entries : view.entries.slice(0, treeRowCap);

  const list = html`<ul class="tree" role="list">
        ${shown.map((entry) => row(view, entry))}
      </ul>`;

  if (shown.length === view.entries.length) return list;

  return html`${list}
      <p class="showall"><a class="t-mono" href="${view.allHref}">Show all ${view.entries.length}<span aria-hidden="true"> →</span></a></p>`;
}

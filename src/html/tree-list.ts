// SPDX-License-Identifier: AGPL-3.0-or-later

// one row implementation for the root tree and every tree below it. a
// gitlink is a plain row carrying its pinned sha: nothing is disabled
// because nothing was ever offered, and reading .gitmodules to link out
// would cost a cat-file and inherit markdown's scheme problem

import type { TreeEntry } from "../repos/tree.js";
import { ageCell } from "./age.js";
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

// a path the bounded log walk never reached renders blank rather than
// costing a longer one, so both cells have an empty state
function columns(entry: TreeEntry, now: Date): Raw {
  if (entry.touched === null) {
    return html`<td class="msg"></td><td class="age"></td>`;
  }

  return html`<td class="msg"><span>${entry.touched.subject}</span></td>${ageCell(entry.touched.at, now)}`;
}

function row(view: TreeListView, entry: TreeEntry): Raw {
  const path = view.path === "" ? entry.name : `${view.path}/${entry.name}`;

  if (entry.kind === "gitlink") {
    return html`<tr class="row is-sub">
            <th class="nm" scope="row"><span class="t-item" lang="en">${pathName(entry.name)}<span class="t-micro"> Pinned</span></span></th>
            <td class="pin" colspan="2"><span class="t-mono"><span class="vh">Submodule pinned at </span>${entry.oid.slice(0, shortShaChars)}</span></td>
          </tr>`;
  }

  const href =
    entry.kind === "directory"
      ? treeHref(view.repo, view.rev, path)
      : blobHref(view.repo, view.rev, path);

  const name =
    entry.kind === "directory"
      ? html`${pathName(entry.name)}/`
      : pathName(entry.name);

  return html`<tr class="row${entry.kind === "directory" ? " is-dir" : ""}">
            <th class="nm" scope="row"><a class="t-item" lang="en" href="${href}">${name}</a></th>
            ${columns(entry, view.now)}
          </tr>`;
}

export function treeList(view: TreeListView): Raw {
  const shown = view.showAll ? view.entries : view.entries.slice(0, treeRowCap);

  const list = html`<table class="tbl tree">
        <caption class="vh">Files</caption>
        <thead>
          <tr>
            <th class="nm t-label" scope="col">Name</th>
            <th class="msg t-label" scope="col">Last commit</th>
            <th class="age t-label" scope="col">Changed</th>
          </tr>
        </thead>
        <tbody>
          ${shown.map((entry) => row(view, entry))}
        </tbody>
      </table>`;

  if (shown.length === view.entries.length) return list;

  return html`${list}
      <p class="showall"><a class="t-mono" href="${view.allHref}">Show all ${view.entries.length}<span aria-hidden="true"> →</span></a></p>`;
}

// SPDX-License-Identifier: AGPL-3.0-or-later

// one row implementation for the root tree and every tree below it

import type { TreeEntry } from "../repos/tree.js";
import { age } from "./age.js";
import { shortShaLength } from "./commit-log.js";
import { pathName } from "./filename.js";
import { blobHref, treeHref } from "./hrefs.js";
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

// an unattributed path renders blank, and the span holds the row's height
function columns(entry: TreeEntry, now: Date): Raw {
  if (entry.touched === null) {
    return html`<td class="msg"><span></span></td><td class="age"><span></span></td>`;
  }

  return html`<td class="msg"><span>${entry.touched.subject}</span><span><time datetime="${entry.touched.at.toISOString()}">${age(entry.touched.at, now)}</time> ago</span></td>`;
}

function row(view: TreeListView, entry: TreeEntry): Raw {
  const path = view.path === "" ? entry.name : `${view.path}/${entry.name}`;

  if (entry.kind === "gitlink") {
    return html`<tr class="row is-sub">
            <th class="name" scope="row"><span class="t-item" lang="en">${pathName(entry.name)}<span class="t-micro"> Pinned</span></span></th>
            <td class="pin" colspan="2"><span class="t-mono"><span class="vh">Submodule pinned at </span>${entry.oid.slice(0, shortShaLength)}</span></td>
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
            <th class="name" scope="row"><a class="t-item" lang="en" href="${href}">${name}</a></th>
            ${columns(entry, view.now)}
          </tr>`;
}

function treeListTableCaption(
  numShownEntries: number,
  numTotalEntries: number,
): string {
  if (numTotalEntries > numShownEntries)
    return `${numShownEntries}/${numTotalEntries} Items · Listed A→Z`;
  if (numShownEntries === 1) return "1 Item";

  return `${numShownEntries} Items · Listed A→Z`;
}

export function treeList(view: TreeListView): Raw {
  const shown = view.showAll ? view.entries : view.entries.slice(0, treeRowCap);

  const list = html`<table class="tbl tree">
        <caption class="t-label">${treeListTableCaption(shown.length, view.entries.length)}</caption>
        <colgroup>
          <col class="c-name" />
          <col class="c-msg" />
        </colgroup>
        <thead>
          <tr>
            <th class="name vh" scope="col">Name</th>
            <th class="vh" scope="col">Commit message and age</th>
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

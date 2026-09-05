// SPDX-License-Identifier: AGPL-3.0-or-later

// the masthead line, extended. one list, and the media query decides which
// items display: the collapsed ones go with display: none, so they leave
// the accessibility tree along with the layout

import { html, type Raw } from "./index.js";
import { treeHref } from "./tree-list.js";

// readonly because site below is one object every render is handed
export type Crumb = { readonly label: string; readonly href: string | null };

const kept = 2;

export const site: Crumb = { label: "Càrn", href: "/" };

export function repoTrail(repo: string): Crumb[] {
  return [site, { label: repo, href: `/r/${repo}` }];
}

export function pathTrail(repo: string, rev: string, path: string): Crumb[] {
  const names = path.split("/");

  return names.map((name, index) => ({
    label: name,
    href:
      index === names.length - 1
        ? null
        : treeHref(repo, rev, names.slice(0, index + 1).join("/")),
  }));
}

function segment(crumb: Crumb): Raw {
  return crumb.href === null
    ? html`<span class="here">${crumb.label}</span>`
    : html`<a href="${crumb.href}">${crumb.label}</a>`;
}

function item(crumb: Crumb, index: number, middle: boolean): Raw {
  const separator =
    index === 0 ? html`` : html`<span aria-hidden="true"> » </span>`;
  const body = html`${separator}${segment(crumb)}`;

  return middle ? html`<li class="mid">${body}</li>` : html`<li>${body}</li>`;
}

export function breadcrumb(crumbs: Crumb[]): Raw {
  const last = crumbs.length - kept;

  const items = crumbs.map((crumb, index) =>
    item(crumb, index, index >= kept && index < last),
  );

  const fold =
    last > kept ? html`<li class="fold" aria-hidden="true"> » …</li>` : html``;

  return html`<nav aria-label="Breadcrumb"><ol class="crumbs t-mono" role="list">${items.slice(0, kept)}${fold}${items.slice(kept)}</ol></nav>`;
}

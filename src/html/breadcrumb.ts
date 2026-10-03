// SPDX-License-Identifier: AGPL-3.0-or-later

import { plainName } from "./filename.js";
import { repoHref, treeHref } from "./hrefs.js";
import { html, type Raw } from "./index.js";

export type Crumb = {
  readonly label: Raw;
  readonly href: string | null;
  readonly container: boolean;
};

export function repoTrail(repo: string): Crumb[] {
  return [{ label: plainName(repo), href: `/r/${repo}`, container: true }];
}

// the rev links to the root tree at that rev, one level above any path
export function revTrail(
  repo: string,
  rev: string,
  defaultBranch: string,
): Crumb[] {
  return [
    ...repoTrail(repo),
    {
      label: plainName(rev),
      href: repoHref(repo, rev, defaultBranch),
      container: true,
    },
  ];
}

// the leaf is the page itself: a tree is a container, a blob isn't
export function pathTrail(
  repo: string,
  rev: string,
  path: string,
  leaf: "tree" | "blob",
): Crumb[] {
  const names = path.split("/");
  const last = names.length - 1;

  return names.map((name, index) => ({
    label: plainName(name),
    href:
      index === last
        ? null
        : treeHref(repo, rev, names.slice(0, index + 1).join("/")),
    container: index < last || leaf === "tree",
  }));
}

function segment(crumb: Crumb): Raw {
  const text = html`${crumb.label}${crumb.container ? "/" : ""}`;

  return crumb.href === null
    ? html`<li aria-current="page">${text}</li>`
    : html`<li><a href="${crumb.href}">${text}</a></li>`;
}

export function address(crumbs: Crumb[]): Raw {
  return html`${crumbs.map(segment)}`;
}

export function pathNav(crumbs: Crumb[]): Raw {
  return html`<nav class="list-nav" aria-labelledby="path-label">
      <p class="t-label" id="path-label">Path</p>
      <ol role="list">
        ${address(crumbs)}
      </ol>
    </nav>`;
}

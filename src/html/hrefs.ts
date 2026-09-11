// SPDX-License-Identifier: AGPL-3.0-or-later

// every url the product generates. views import from here and this imports
// nothing from src/html, so building a link can never pull one page module
// into another's import graph

import type { RefKind } from "../repos/refs.js";

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

export function commitsPath(repo: string): string {
  return `/r/${repo}/commits`;
}

export function commitsHref(
  repo: string,
  ref: string,
  from?: string | null,
  back?: string[],
): string {
  let query = `${commitsPath(repo)}?ref=${encodeURIComponent(ref)}`;
  if (from) query += `&from=${from}`;
  if (back !== undefined && back.length > 0) query += `&back=${back.join(",")}`;
  return query;
}

export function commitHref(repo: string, sha: string): string {
  return `${commitsPath(repo)}/${sha}`;
}

export function changeHref(repo: string, sha: string, path: string): string {
  const segments = path.split("/").map(encodeURIComponent).join("/");
  return `${commitHref(repo, sha)}/${segments}`;
}

// the plural is both the url segment and the word the headings read with
export const refPlural: Record<RefKind, string> = {
  branch: "branches",
  tag: "tags",
};

export function refsHref(repo: string, kind: RefKind): string {
  return `/r/${repo}/${refPlural[kind]}`;
}

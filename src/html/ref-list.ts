// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  type Ref,
  type RefKind,
  type RefList,
  refNouns,
} from "../repos/refs.js";
import { sshRemote } from "../repos/remote.js";
import { age } from "./age.js";
import { repoTrail } from "./breadcrumb.js";
import { emptyState } from "./empty-state.js";
import { plainName } from "./filename.js";
import { commitsHref, refsHref } from "./hrefs.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";
import { budgetBytes, pageWireBytes } from "./wire-weight.js";

// the nouns are lowercase for urls and prose, not labels or columns
function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function refLabel(kind: RefKind): string {
  return capitalize(refNouns[kind].many);
}

export type RefListPage = {
  repo: string;
  list: RefList;
  defaultBranch: string;
  now: Date;
};

function marker(view: RefListPage, ref: Ref): Raw {
  if (view.list.kind === "branch") {
    return ref.name === view.defaultBranch
      ? html`<span class="t-micro"> Default</span>`
      : html``;
  }

  return ref.annotated ? html`<span class="t-micro"> Annotated</span>` : html``;
}

function subject(ref: Ref, href: string): Raw {
  if (ref.subject === "") return html`<td class="msg"><span></span></td>`;
  return html`<td class="msg"><a href="${href}">${ref.subject}</a></td>`;
}

function row(view: RefListPage, ref: Ref): Raw {
  const href = commitsHref(view.repo, ref.name);

  return html`<tr class="row">
            <th class="name" scope="row"><a class="t-item" lang="en" href="${href}">${plainName(ref.name)}${marker(view, ref)}</a></th>
            ${subject(ref, href)}
            <td class="age"><a href="${href}"><time datetime="${ref.at.toISOString()}">${age(ref.at, view.now)}</time></a></td>
          </tr>`;
}

function truncated(view: RefListPage, shown: number, more: boolean): Raw {
  if (!more) return html``;
  return html`<p class="t-note">Showing the first ${shown} ${refNouns[view.list.kind].many}.</p>
      `;
}

function empty(view: RefListPage): Raw {
  const remote = sshRemote(view.repo);
  const nouns = refNouns[view.list.kind];

  const message = `No ${nouns.many} yet. Every ${nouns.one} in this repo is listed here once something is pushed.`;
  const command = `git push ${remote} ${view.list.kind === "branch" ? view.defaultBranch : "--tags"}`;

  return emptyState(message, command);
}

function list(view: RefListPage, refs: Ref[], more: boolean): Raw {
  const { many, one } = refNouns[view.list.kind];
  const heading = capitalize(many);
  const column = capitalize(one);

  return html`${truncated(view, refs.length, more)}<table class="tbl refs">
        <caption class="vh">${heading}</caption>
        <thead>
          <tr>
            <th class="name t-label" scope="col">${column}</th>
            <th class="msg t-label" scope="col">Subject</th>
            <th class="age t-label" scope="col">Age</th>
          </tr>
        </thead>
        <tbody>
          ${refs.map((ref) => row(view, ref))}
        </tbody>
      </table>`;
}

function document(view: RefListPage, refs: Ref[], more: boolean): string {
  const heading = refLabel(view.list.kind);

  return page({
    title: `${heading} · ${view.repo} · Càrn`,
    description: `The ${refNouns[view.list.kind].many} in ${view.repo}.`,
    path: refsHref(view.repo, view.list.kind),
    crumbs: [...repoTrail(view.repo), { label: heading, href: null }],
    main: html`<h1 class="t-item t-item--title">${heading}</h1>
      ${refs.length === 0 ? empty(view) : list(view, refs, more)}`,
  });
}

// a 500-char subject leaves no fixed row weight to model, so this measures
export function refListPage(view: RefListPage): string {
  const { refs, more } = view.list;
  let shown = refs.length;
  let markup = document(view, refs, more);

  while (shown > 1 && pageWireBytes(markup) > budgetBytes) {
    shown = Math.floor(shown / 2);
    markup = document(view, refs.slice(0, shown), true);
  }

  return markup;
}

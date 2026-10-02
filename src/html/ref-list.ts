// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  type Ref,
  type RefKind,
  type RefList,
  refNouns,
} from "../repos/refs.js";
import { sshRemote } from "../repos/remote.js";
import { age } from "./age.js";
import { pathNav, repoTrail } from "./breadcrumb.js";
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

// a count of one reads as a quantity where the noun alone reads as rank
function caption(kind: RefKind, shown: number, more: boolean): string {
  const one = capitalize(refNouns[kind].one);
  const many = capitalize(refNouns[kind].many);

  if (more && shown === 1) return `First ${one}`;
  if (more) return `First ${shown} ${many}`;
  if (shown === 1) return `1 ${one}`;

  return `${shown} ${many}`;
}

function empty(view: RefListPage): Raw {
  const remote = sshRemote(view.repo);
  const nouns = refNouns[view.list.kind];

  const message = `No ${nouns.many} yet. Every ${nouns.one} in this repo is listed here once something is pushed.`;
  const command = `git push ${remote} ${view.list.kind === "branch" ? view.defaultBranch : "--tags"}`;

  return emptyState(message, command);
}

function list(view: RefListPage, refs: Ref[], more: boolean): Raw {
  const column = capitalize(refNouns[view.list.kind].one);

  return html`<table class="tbl refs">
        <caption class="t-label">${caption(view.list.kind, refs.length, more)}</caption>
        <colgroup>
          <col />
          <col />
          <col class="age" />
        </colgroup>
        <thead>
          <tr>
            <th class="name vh" scope="col">${column}</th>
            <th class="vh" scope="col">Subject</th>
            <th class="vh" scope="col">Age</th>
          </tr>
        </thead>
        <tbody>
          ${refs.map((ref) => row(view, ref))}
        </tbody>
      </table>`;
}

function side(repo: string, heading: string): Raw {
  return html`<div class="page-side">
          ${pathNav([
            ...repoTrail(repo),
            { label: html`${heading}`, href: null, container: false },
          ])}
        </div>`;
}

function document(view: RefListPage, refs: Ref[], more: boolean): string {
  const heading = refLabel(view.list.kind);

  return page({
    title: `${heading} · ${view.repo} · Càrn`,
    description: `The ${refNouns[view.list.kind].many} in ${view.repo}.`,
    path: refsHref(view.repo, view.list.kind),
    main: html`<h1 class="vh">${heading}</h1>
      <div class="page-body">
        ${side(view.repo, heading)}
        <div class="page-main">
          ${refs.length === 0 ? empty(view) : list(view, refs, more)}
        </div>
      </div>`,
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

// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Ref, RefKind, RefList } from "../repos/refs.js";
import { sshRemote } from "../repos/remote.js";
import { age } from "./age.js";
import { repoTrail } from "./breadcrumb.js";
import { plainName } from "./filename.js";
import { commitsHref, refPlural, refsHref } from "./hrefs.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";
import { budgetBytes, pageWireBytes } from "./wire-weight.js";

export type RefListPage = {
  repo: string;
  list: RefList;
  defaultBranch: string;
  now: Date;
};

const nouns: Record<RefKind, { heading: string; column: string }> = {
  branch: { heading: "Branches", column: "Branch" },
  tag: { heading: "Tags", column: "Tag" },
};

function marker(view: RefListPage, ref: Ref): Raw {
  if (view.list.kind === "branch") {
    return ref.name === view.defaultBranch
      ? html`<span class="t-micro"> Default</span>`
      : html``;
  }

  return ref.annotated ? html`<span class="t-micro"> Annotated</span>` : html``;
}

// an empty subject gets a span, never a link with no accessible name
function subject(ref: Ref, href: string): Raw {
  if (ref.subject === "") return html`<td class="msg"><span></span></td>`;

  return html`<td class="msg"><a href="${href}">${ref.subject}</a></td>`;
}

function row(view: RefListPage, ref: Ref): Raw {
  const href = commitsHref(view.repo, ref.name);

  return html`<tr class="row">
            <th class="nm" scope="row"><a class="t-item" lang="en" href="${href}">${plainName(ref.name)}${marker(view, ref)}</a></th>
            ${subject(ref, href)}
            <td class="age"><a href="${href}"><time datetime="${ref.at.toISOString()}">${age(ref.at, view.now)}</time></a></td>
          </tr>`;
}

function truncated(view: RefListPage, shown: number, more: boolean): Raw {
  if (!more) return html``;

  return html`<p class="t-note">Showing the first ${shown} ${refPlural[view.list.kind]}.</p>
      `;
}

function empty(view: RefListPage): Raw {
  const remote = sshRemote(view.repo);

  return view.list.kind === "branch"
    ? html`<div class="empty">
        <p class="t-body">No branches yet. Every branch in this repo is listed here once something is pushed.</p>
        <p><code class="t-mono">git push ${remote} ${view.defaultBranch}</code></p>
      </div>`
    : html`<div class="empty">
        <p class="t-body">No tags yet. Every tag in this repo is listed here once one is pushed.</p>
        <p><code class="t-mono">git push ${remote} --tags</code></p>
      </div>`;
}

function list(view: RefListPage, refs: Ref[], more: boolean): Raw {
  const { heading, column } = nouns[view.list.kind];

  return html`${truncated(view, refs.length, more)}<table class="tbl refs">
        <caption class="vh">${heading}</caption>
        <thead>
          <tr>
            <th class="nm t-label" scope="col">${column}</th>
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
  const { heading } = nouns[view.list.kind];

  return page({
    title: `${heading} · ${view.repo} · Càrn`,
    description: `The ${refPlural[view.list.kind]} in ${view.repo}.`,
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

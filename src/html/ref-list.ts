// SPDX-License-Identifier: AGPL-3.0-or-later

// three cells, three links, no row overlay. position: relative on a <tr>
// is patchy in WebKit, and BRAND.md:618 draws the rule under a table
// heading in --ink, so the design was already drawn for this markup

import type { Ref, RefKind, RefList } from "../repos/refs.js";
import { sshRemote } from "../repos/remote.js";
import { age } from "./age.js";
import { commitsHref } from "./commit-log.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";
import { budgetBytes, pageWireBytes } from "./wire-weight.js";

export type RefListPage = {
  repo: string;
  list: RefList;
  defaultBranch: string;
  now: Date;
};

const nouns: Record<
  RefKind,
  { heading: string; column: string; many: string }
> = {
  branch: { heading: "Branches", column: "Branch", many: "branches" },
  tag: { heading: "Tags", column: "Tag", many: "tags" },
};

export function refsHref(repo: string, kind: RefKind): string {
  return `/r/${repo}/${nouns[kind].many}`;
}

function marker(view: RefListPage, ref: Ref): Raw {
  if (view.list.kind !== "branch" || ref.name !== view.defaultBranch) {
    return html``;
  }

  return html` <span class="t-micro">Default</span>`;
}

// git takes an empty commit message, and a link wrapped around one has no
// accessible name at all: the cell goes bare rather than nameless
function subject(ref: Ref, href: string): Raw {
  if (ref.subject === "") return html`<td class="msg"></td>`;

  return html`<td class="msg"><a href="${href}">${ref.subject}</a></td>`;
}

function row(view: RefListPage, ref: Ref): Raw {
  const href = commitsHref(view.repo, ref.name);

  return html`<tr>
            <td class="nm"><a class="t-item" href="${href}">${ref.name}${marker(view, ref)}</a></td>
            ${subject(ref, href)}
            <td class="age"><a href="${href}"><time datetime="${ref.at.toISOString()}">${age(ref.at, view.now)}</time></a></td>
          </tr>`;
}

function truncated(view: RefListPage, shown: number, more: boolean): Raw {
  if (!more) return html``;

  return html`<p class="t-label">Showing the first ${shown} ${nouns[view.list.kind].many}.</p>
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

function table(view: RefListPage, refs: Ref[], more: boolean): Raw {
  return html`${truncated(view, refs.length, more)}<table class="refs">
        <thead>
          <tr>
            <th class="t-label" scope="col">${nouns[view.list.kind].column}</th>
            <th class="t-label" scope="col">Subject</th>
            <th class="t-label" scope="col">Age</th>
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
    description: `The ${nouns[view.list.kind].many} in ${view.repo}.`,
    path: refsHref(view.repo, view.list.kind),
    main: html`<h1 class="t-label">${heading}</h1>
      ${refs.length === 0 ? empty(view) : table(view, refs, more)}`,
  });
}

// a subject runs to 500 characters, so a row has no fixed weight a read
// cap could have been derived from. halving rather than modelling: one
// enormous subject defeats an average
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

// SPDX-License-Identifier: AGPL-3.0-or-later

// three links per row and no ::after overlay. BRAND.md's Row component
// keeps .msg and .age above the overlay so they stay selectable, and says
// the subject and the age become links to the commit here, which a
// whole-row anchor would forbid

import type { CommitLog } from "../repos/log.js";
import { sshRemote } from "../repos/remote.js";
import { age } from "./age.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";

export const shortShaChars = 7;

export function commitsHref(
  repo: string,
  ref: string,
  from?: string | null,
): string {
  const query = `?ref=${encodeURIComponent(ref)}`;
  return from
    ? `/r/${repo}/commits${query}&from=${from}`
    : `/r/${repo}/commits${query}`;
}

export function commitHref(repo: string, sha: string): string {
  return `/r/${repo}/commits/${sha}`;
}

function row(
  repo: string,
  commit: CommitLog["commits"][number],
  now: Date,
): Raw {
  const href = commitHref(repo, commit.sha);

  return html`<li class="row">
        <a class="nm t-mono" href="${href}">${commit.sha.slice(0, shortShaChars)}</a>
        <a class="msg" href="${href}">${commit.subject}</a>
        <a class="age" href="${href}"><span class="vh">Committed </span><time datetime="${commit.at.toISOString()}">${age(commit.at, now)}</time></a>
      </li>`;
}

function empty(repo: string, ref: string): Raw {
  return html`<div class="empty">
        <p class="t-body">No commits yet. The log for ${ref} is shown here once something is pushed to it.</p>
        <p><code class="t-mono">git push ${sshRemote(repo)} ${ref}</code></p>
      </div>`;
}

function older(repo: string, log: CommitLog): Raw {
  if (log.next === null) return html``;

  return html`
      <p class="showall"><a class="t-mono" href="${commitsHref(repo, log.ref, log.next)}">Older<span aria-hidden="true"> →</span></a></p>`;
}

export function commitLogPage(view: {
  repo: string;
  log: CommitLog;
  now: Date;
  from?: string | null;
}): string {
  const { repo, log } = view;

  const body =
    log.commits.length === 0
      ? empty(repo, log.ref)
      : html`<ul class="log" role="list">
        ${log.commits.map((commit) => row(repo, commit, view.now))}
      </ul>${older(repo, log)}`;

  return page({
    title: `Commits on ${log.ref} · ${repo} · Càrn`,
    description: `The commit log for ${log.ref} in ${repo}.`,
    path: commitsHref(repo, log.ref, view.from ?? null),
    main: html`<h1 class="t-label">Commits on ${log.ref}</h1>
      ${body}`,
  });
}

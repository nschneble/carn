// SPDX-License-Identifier: AGPL-3.0-or-later

// three links per row and no ::after overlay. BRAND.md's Row component
// keeps .msg and .age above the overlay so they stay selectable, and says
// the subject and the age become links to the commit here, which a
// whole-row anchor would forbid

import { oidPattern } from "../git/oid.js";
import type { CommitLog } from "../repos/log.js";
import { sshRemote } from "../repos/remote.js";
import { age } from "./age.js";
import { repoTrail } from "./breadcrumb.js";
import { html, type Raw } from "./index.js";
import { page } from "./page.js";

export const shortShaChars = 7;

export const commitsLabel = "Commits";

// past this many page-start cursors, newer stops rather than the url growing
export const backStackCap = 32;

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

function capBack(back: string[]): string[] {
  return back.length > backStackCap ? back.slice(-backStackCap) : back;
}

// one bad entry rejects the whole list, never half-trusts a partial one
export function parseBackStack(raw: string | string[] | undefined): string[] {
  if (raw === undefined || Array.isArray(raw)) return [];

  const entries = raw.split(",");
  return entries.every((entry) => oidPattern.test(entry))
    ? capBack(entries)
    : [];
}

export function commitHref(repo: string, sha: string): string {
  return `${commitsPath(repo)}/${sha}`;
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

function older(
  repo: string,
  log: CommitLog,
  from: string | null,
  back: string[],
): Raw {
  if (log.next === null) return html``;

  const nextBack = capBack(from === null ? back : [...back, from]);

  return html`
      <p class="showall"><a class="t-mono" href="${commitsHref(repo, log.ref, log.next, nextBack)}">Older<span aria-hidden="true"> →</span></a></p>`;
}

// the cursor a step back is the stack's last entry, minus itself and it
function newer(
  repo: string,
  ref: string,
  from: string | null,
  back: string[],
): Raw {
  if (from === null) return html``;

  const walked = [...back, from];
  walked.pop();
  const target = walked.pop() ?? null;

  return html`
      <p class="showall"><a class="t-mono" href="${commitsHref(repo, ref, target, walked)}"><span aria-hidden="true">← </span>Newer</a></p>`;
}

export function commitLogPage(view: {
  repo: string;
  log: CommitLog;
  now: Date;
  from?: string | null;
  back?: string[];
}): string {
  const { repo, log } = view;
  const from = view.from ?? null;
  const back = view.back ?? [];

  const body =
    log.commits.length === 0
      ? empty(repo, log.ref)
      : html`<ul class="log" role="list">
        ${log.commits.map((commit) => row(repo, commit, view.now))}
      </ul>${newer(repo, log.ref, from, back)}${older(repo, log, from, back)}`;

  return page({
    title: `Commits on ${log.ref} · ${repo} · Càrn`,
    description: `The commit log for ${log.ref} in ${repo}.`,
    path: commitsHref(repo, log.ref, from, back),
    crumbs: [...repoTrail(repo), { label: commitsLabel, href: null }],
    main: html`<h1 class="t-item">Commits on ${log.ref}</h1>
      ${body}`,
  });
}

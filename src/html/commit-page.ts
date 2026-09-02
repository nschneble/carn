// SPDX-License-Identifier: AGPL-3.0-or-later

// how many diffs fit is decided by gzipping the whole rendered document,
// never by a per-byte model: every document this file returns is one it
// measured under the budget, so a search that only returns a probe it
// measured cannot ship a page it guessed at

import { type CommitDetail, type DiffFile, hunks } from "../repos/commit.js";
import { ageMarkup } from "./age.js";
import { type Crumb, repoTrail } from "./breadcrumb.js";
import {
  commitHref,
  commitsLabel,
  commitsPath,
  shortShaChars,
} from "./commit-log.js";
import { html, type Raw, raw } from "./index.js";
import { page } from "./page.js";
import {
  budgetBytes,
  pageWireBytes,
  stylesheetWireBytes,
} from "./wire-weight.js";

export type CommitPage = {
  repo: string;
  commit: CommitDetail;
  now: Date;
  sheetWire?: number;
};

type Shape = { files: number; diffs: number };

const signatures: Record<string, string> = {
  B: "Bad signature",
  E: "Signature can't be checked",
  G: "Good signature",
  R: "Good signature, revoked key",
  U: "Good signature, unknown trust",
  X: "Good signature, expired",
  Y: "Good signature, expired key",
};

export function changeHref(repo: string, sha: string, path: string): string {
  const segments = path.split("/").map(encodeURIComponent).join("/");
  return `${commitHref(repo, sha)}/${segments}`;
}

function short(sha: string): string {
  return sha.slice(0, shortShaChars);
}

function binary(file: DiffFile): boolean {
  return file.added === null || file.deleted === null;
}

// the counts carry direction in the characters themselves, so the palette
// is decoration and grayscale loses nothing
function counts(file: DiffFile): Raw {
  if (binary(file)) return html`Binary`;

  return html`+${file.added}<span class="vh"> added</span> −${file.deleted}<span class="vh"> removed</span>`;
}

function name(file: DiffFile): Raw {
  if (file.from === null) return html`${file.path}`;

  return html`${file.from}<span class="vh"> renamed to</span><span aria-hidden="true"> → </span>${file.path}`;
}

// binary carries no diff, so it gets no marker: nothing is ever inlined
function destination(file: DiffFile, inlined: boolean): Raw {
  if (binary(file)) return html``;

  return inlined
    ? html` <span class="t-micro">Below<span class="vh"> on this page</span></span>`
    : html` <span class="t-micro">Own page</span>`;
}

function row(
  view: CommitPage,
  file: DiffFile,
  index: number,
  inlined: boolean,
): Raw {
  const href = inlined
    ? `#f-${index}`
    : changeHref(view.repo, view.commit.sha, file.path);

  return html`<li class="row">
        <a class="nm t-mono" href="${href}">${name(file)}${destination(file, inlined)}</a>
        <span class="cnt">${counts(file)}</span>
      </li>`;
}

function fileList(
  view: CommitPage,
  shape: Shape,
  inlined: Set<number>,
  totalDiffable: number,
): Raw {
  const { files } = view.commit;

  if (files.length === 0) {
    return html`<div class="empty">
        <p class="t-body">This commit changes no files.</p>
      </div>`;
  }

  // an empty list is not a list: a <ul role="list"> with no <li> under it
  // fails aria-required-children, so the state says so in words instead
  if (shape.files === 0) {
    return html`<div class="empty">
        <p class="t-body">This commit changes ${files.length} files, more than this page can list.</p>
        <p><code class="t-mono">git show --stat ${view.commit.sha}</code></p>
      </div>`;
  }

  const cutFiles =
    shape.files === files.length
      ? html``
      : html`<p class="t-note">Showing the first ${shape.files} of ${files.length} files.</p>
      `;

  // the file list can stay whole while the diffs under it are still cut
  const cutDiffs =
    inlined.size === totalDiffable
      ? html``
      : html`<p class="t-note">Diffs for the first ${inlined.size} files are below. The rest have a page each.</p>
      `;

  return html`${cutFiles}${cutDiffs}<ul class="files" role="list">
        ${files
          .slice(0, shape.files)
          .map((file, index) => row(view, file, index, inlined.has(index)))}
      </ul>`;
}

// only a changed line is marked: the tone is a second signal behind the
// + and the −, and it costs a span exactly where something changed
function diffBody(text: string): Raw {
  const lines = text.split("\n").map((line) => {
    if (line.startsWith("@@")) return html`<span class="h">${line}</span>`;
    if (line.startsWith("+")) return html`<span class="a">${line}</span>`;
    if (line.startsWith("-")) return html`<span class="d">${line}</span>`;
    return html`${line}`;
  });

  return raw(lines.map((line) => line.value).join("\n"));
}

function block(file: DiffFile, index: number, text: string): Raw {
  const label = `f-${index}`;

  return html`<h2 class="t-mono dpath" id="${label}">${file.path}</h2>
      <pre class="src diff" tabindex="0" role="region" aria-labelledby="${label}"><code>${diffBody(text)}</code></pre>`;
}

function cutBlock(
  file: DiffFile,
  index: number,
  text: string,
  cut: number,
): Raw {
  const label = `f-${index}`;

  return html`<h2 class="t-mono dpath" id="${label}">${file.path}</h2>
      <p class="t-note" id="${label}-cut">Showing the first ${cut} lines of this diff.</p>
      <pre class="src diff" tabindex="0" role="region" aria-labelledby="${label}" aria-describedby="${label}-cut"><code>${diffBody(text)}</code></pre>`;
}

function field(term: string, value: Raw): Raw {
  return html`<div><dt>${term}</dt><dd>${value}</dd></div>`;
}

function parents(view: CommitPage): Raw {
  const list = view.commit.parents;
  if (list.length === 0) return html`None — this is the first commit`;

  return html`${list.map(
    (parent, index) =>
      html`${index === 0 ? "" : ", "}<a class="t-mono" href="${commitHref(view.repo, parent)}">${short(parent)}</a>`,
  )}`;
}

function changed(commit: CommitDetail): Raw {
  const { files } = commit;
  if (files.length === 0) return html`No files`;

  const added = files.reduce((total, file) => total + (file.added ?? 0), 0);
  const deleted = files.reduce((total, file) => total + (file.deleted ?? 0), 0);

  return html`${files.length} ${files.length === 1 ? "file" : "files"}, +${added}<span class="vh"> added</span> −${deleted}<span class="vh"> removed</span>`;
}

function meta(view: CommitPage): Raw {
  const { commit } = view;

  return html`<dl class="meta">${[
    field(
      "Author",
      html`${commit.author} ${ageMarkup("authored", commit.at, view.now)}`,
    ),
    field("Parents", parents(view)),
    field("Changed", changed(commit)),
    field("Signed", html`${signatures[commit.signature] ?? "No signature"}`),
  ]}</dl>`;
}

function message(commit: CommitDetail): Raw {
  if (commit.body === "") return html``;

  return html`<pre class="cmsg t-body">${commit.body}</pre>
      `;
}

function title(commit: CommitDetail): string {
  return commit.subject === "" ? short(commit.sha) : commit.subject;
}

function head(view: CommitPage, linked: boolean): Raw {
  const { commit } = view;
  const sha = linked
    ? html`<a class="t-mono" href="${commitHref(view.repo, commit.sha)}">${short(commit.sha)}</a>`
    : html`${short(commit.sha)}`;

  return html`<h1 class="t-item">${title(commit)}</h1>
      <p class="t-mono sha">${sha}</p>
      ${message(commit)}${meta(view)}`;
}

// the log the commit sits in, then the commit itself; a file view hangs
// its path off the commit that changed it
function trail(view: CommitPage, file: string | null): Crumb[] {
  const commit: Crumb[] = [
    ...repoTrail(view.repo),
    { label: commitsLabel, href: commitsPath(view.repo) },
    {
      label: short(view.commit.sha),
      href: file === null ? null : commitHref(view.repo, view.commit.sha),
    },
  ];

  return file === null ? commit : [...commit, { label: file, href: null }];
}

function shell(view: CommitPage, main: Raw, file: string | null): string {
  const { repo, commit } = view;

  return page({
    title: `${file ?? title(commit)} · ${repo} · Càrn`,
    description: `${title(commit)} in ${repo}.`,
    path:
      file === null
        ? commitHref(repo, commit.sha)
        : changeHref(repo, commit.sha, file),
    crumbs: trail(view, file),
    main,
  });
}

function render(view: CommitPage, shape: Shape, candidates: number[]): string {
  const { commit } = view;
  const inlined = candidates
    .filter((index) => index < shape.files)
    .slice(0, shape.diffs);

  const diffs = inlined.map((index) => {
    const file = commit.files[index] as DiffFile;
    return block(file, index, hunks(file.patch) as string);
  });

  return shell(
    view,
    html`${head(view, false)}
      ${fileList(view, shape, new Set(inlined), candidates.length)}
      ${diffs}`,
    null,
  );
}

function weight(view: CommitPage, markup: string): number {
  return pageWireBytes(markup, view.sheetWire ?? stylesheetWireBytes);
}

// the largest count whose real gzip-5 page fits, found by halving rather
// than by walking: a probe is a whole document, so a forty-file commit
// costs six of them instead of forty
function largestFitting(
  ceiling: number,
  fits: (count: number) => string | null,
): { count: number; markup: string } | null {
  let low = 0;
  let high = ceiling;
  let kept: { count: number; markup: string } | null = null;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const rendered = fits(middle);

    if (rendered === null) {
      high = middle - 1;
    } else {
      kept = { count: middle, markup: rendered };
      low = middle + 1;
    }
  }

  return kept;
}

export function inlinableFiles(commit: CommitDetail): number[] {
  return commit.files
    .map((file, index) => (hunks(file.patch) === null ? -1 : index))
    .filter((index) => index !== -1);
}

export function commitPage(view: CommitPage): string {
  const candidates = inlinableFiles(view.commit);
  const all = { files: view.commit.files.length, diffs: candidates.length };

  const whole = render(view, all, candidates);
  if (weight(view, whole) <= budgetBytes) return whole;

  // the rows come first: a commit touching thousands of paths can outweigh
  // the page on the list alone, and a diff inlined above a list that does
  // not fit would be measured against a document nobody can ship
  const listed = largestFitting(all.files, (files) => {
    const rendered = render(view, { files, diffs: 0 }, candidates);
    return weight(view, rendered) <= budgetBytes ? rendered : null;
  });

  // header and meta with nothing under them is the smallest this page has,
  // so there is no shorter document to fall back to
  if (listed === null) return render(view, { files: 0, diffs: 0 }, candidates);

  const files = listed.count;
  const inlined = largestFitting(all.diffs, (diffs) => {
    const rendered = render(view, { files, diffs }, candidates);
    return weight(view, rendered) <= budgetBytes ? rendered : null;
  });

  return (inlined ?? listed).markup;
}

function changeDocument(
  view: CommitPage,
  file: DiffFile,
  index: number,
  text: string,
  cut: number | null,
): string {
  const shown =
    cut === null
      ? block(file, index, text)
      : html`${cutBlock(file, index, text, cut)}
      <p class="t-body">Read the rest of it with <code class="t-mono">git show ${view.commit.sha} -- ${file.path}</code></p>`;

  return shell(
    view,
    html`${head(view, true)}
      ${shown}`,
    file.path,
  );
}

function noDiff(view: CommitPage, file: DiffFile): string {
  const said = binary(file)
    ? "This file is binary, so there's no diff to show."
    : "This commit changes no lines in this file.";

  return shell(
    view,
    html`${head(view, true)}
      <h2 class="t-mono dpath">${file.path}</h2>
      <div class="empty">
        <p class="t-body">${said}</p>
      </div>`,
    file.path,
  );
}

// one file can outweigh the page on its own, so the same halving cuts it
// on a line boundary and measures what is left
export function commitFilePage(view: CommitPage, path: string): string | null {
  const index = view.commit.files.findIndex((file) => file.path === path);
  if (index === -1) return null;

  const file = view.commit.files[index] as DiffFile;
  const text = hunks(file.patch);

  if (text === null) return noDiff(view, file);

  const whole = changeDocument(view, file, index, text, null);
  if (weight(view, whole) <= budgetBytes) return whole;

  const lines = text.split("\n");

  const cut = largestFitting(lines.length - 1, (shown) => {
    const rendered = changeDocument(
      view,
      file,
      index,
      lines.slice(0, shown).join("\n"),
      shown,
    );

    return weight(view, rendered) <= budgetBytes ? rendered : null;
  });

  return cut?.markup ?? changeDocument(view, file, index, "", 0);
}

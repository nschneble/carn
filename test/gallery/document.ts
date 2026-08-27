// SPDX-License-Identifier: AGPL-3.0-or-later

import { html } from "../../src/html/index.js";
import { stylesheet } from "../../src/html/styles.js";
import type { Theme } from "../../src/html/theme.js";

const hoverSimulation = `.row.is-hover {
  background: var(--sunk);
}`;

const chevron = html`<svg
  class="chev"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="10"
  height="10"
  viewBox="0 0 10 10"
><path d="M2 0 7 5 2 10 1 9 5 5 1 1Z" /></svg>`;

const type = html`<section>
  <h2 class="t-l">Type</h2>
  <h3 class="t-m">Ownership and admins</h3>
  <p class="t-body">
    Save a URL, read it later. Self-hosted, and the whole thing is a Compose
    file.
  </p>
  <p class="t-label">Investment range</p>
  <p class="t-micro">Opened 3 days ago</p>
  <p class="t-mono">git@carn.fancyenchiladas.net:linklater</p>
</section>`;

const buttons = html`<section>
  <h2 class="t-l">Button</h2>
  <p><button class="btn" type="button">Create${chevron}</button></p>
  <p>
    <button class="btn btn--ghost" type="button">Or just push to it${chevron}</button>
  </p>
  <p><button class="btn btn--block" type="button">Merge${chevron}</button></p>
  <p class="t-body" id="merge-reason">This branch has conflicts in 2 files</p>
  <p>
    <button
      class="btn"
      type="button"
      aria-disabled="true"
      aria-describedby="merge-reason"
    >Merge${chevron}</button>
  </p>
</section>`;

const chips = html`<section>
  <h2 class="t-l">Chip</h2>
  <div class="chips">
    <span class="chip">Draft</span>
    <span class="chip chip--current"><span class="vh">current </span>Open</span>
    <span class="chip">Merged</span>
  </div>
</section>`;

const rows = html`<section>
  <h2 class="t-l">Row</h2>
  <div class="row is-dir">
    <a class="nm t-item" lang="en" href="#row-dir"><span class="sc">docs</span>/</a>
    <span class="msg">Move the brand book out of the artifact</span>
    <span class="age">3d</span>
  </div>
  <div class="row is-dir is-hover">
    <a class="nm t-item" lang="en" href="#row-hover"><span class="sc">src</span>/<span class="sc">components</span>/</a>
    <span class="msg">Split the button out of the header</span>
    <span class="age">6h</span>
  </div>
  <div class="row">
    <a class="nm t-item" lang="en" href="#row-file">README.<span class="sc">md</span></a>
    <span class="msg">Say what it does before saying how to run it</span>
    <span class="age">2w</span>
  </div>
  <div class="row">
    <a class="nm t-item" lang="en" href="#row-long">B<span class="sc">utton</span>.<span class="sc">tsx</span></a>
    <span class="msg">Reject refs beginning with a dash</span>
    <span class="age">14w</span>
  </div>
</section>`;

const fields = html`<section>
  <h2 class="t-l">Field</h2>
  <div class="field">
    <label for="repo-name">Name</label>
    <input
      class="box"
      id="repo-name"
      name="name"
      type="text"
      placeholder="linklater"
    />
    <p class="hint">Lowercase, hyphens, up to 40 characters</p>
  </div>
  <div class="field">
    <label for="repo-about">About</label>
    <textarea
      class="box box--area"
      id="repo-about"
      name="about"
      placeholder="What it does, in one line"
    ></textarea>
    <p class="hint">Shown on the index, never on the repo page</p>
  </div>
</section>`;

const meta = html`<section>
  <h2 class="t-l">Meta</h2>
  <dl class="meta">
    <div>
      <dt>Source</dt>
      <dd>14-conflict-output</dd>
    </div>
    <div>
      <dt>Target</dt>
      <dd>main</dd>
    </div>
    <div>
      <dt>Strategy</dt>
      <dd>Squash</dd>
    </div>
    <div>
      <dt>Mergeability</dt>
      <dd>Conflicts in 2 files</dd>
    </div>
  </dl>
</section>`;

const tags = html`<section>
  <h2 class="t-l">Tag</h2>
  <p><span class="tag">Open</span> <span class="tag tag--quiet">Merged</span></p>
</section>`;

const body = html`<body>
  <header>
    <a class="skip" href="#main">Skip to content</a>
    <p class="t-micro">Càrn component gallery</p>
  </header>
  <main id="main" tabindex="-1">
    <h1 class="t-xl">Linklater</h1>
    ${type}${buttons}${chips}${rows}${fields}${meta}${tags}
  </main>
</body>`;

export function galleryDocument(theme: Theme | null): string {
  const open =
    theme === null
      ? html`<html lang="en">`
      : html`<html lang="en" data-theme="${theme}">`;

  return `<!doctype html>
${open.value}
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Component gallery · Càrn</title>
<style>
${stylesheet}
${hoverSimulation}
</style>
</head>
${body.value}
</html>
`;
}

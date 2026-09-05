// SPDX-License-Identifier: AGPL-3.0-or-later

import { html } from "../../src/html/index.js";
import { stylesheet } from "../../src/html/styles.js";
import { type HeaderImage, headerMarkup } from "../../src/repos/header.js";
import { wordmark } from "../../src/repos/wordmark.js";

function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw({ raw: strings }, ...values);
}

const hoverSimulation = css`.tbl tbody tr.is-hover {
  background: var(--sunk);
}`;

const figureFit = css`figure {
  max-width: 360px;
  margin: var(--s4) 0;
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
  <h2 class="t-l">Table</h2>
  <table class="tbl tree">
    <caption class="vh">Files</caption>
    <thead>
      <tr>
        <th class="nm t-label" scope="col">Name</th>
        <th class="msg t-label" scope="col">Commit</th>
        <th class="age t-label" scope="col">Age</th>
      </tr>
    </thead>
    <tbody>
      <tr class="row is-dir">
        <th class="nm" scope="row"><a class="t-item" lang="en" href="#row-dir"><span class="caps">docs</span>/</a></th>
        <td class="msg"><span>Move the brand book out of the artifact</span></td>
        <td class="age"><time datetime="2026-01-07">3d</time></td>
      </tr>
      <tr class="row is-dir is-hover">
        <th class="nm" scope="row"><a class="t-item" lang="en" href="#row-hover"><span class="caps">src/components</span>/</a></th>
        <td class="msg"><span>Split the button out of the header</span></td>
        <td class="age"><time datetime="2026-01-10">6h</time></td>
      </tr>
      <tr class="row">
        <th class="nm" scope="row"><a class="t-item" lang="en" href="#row-file"><span class="caps">README<span class="sc">.md</span></span></a></th>
        <td class="msg"><span>Say what it does before saying how to run it</span></td>
        <td class="age"><time datetime="2025-12-27">2w</time></td>
      </tr>
      <tr class="row">
        <th class="nm" scope="row"><a class="t-item" lang="en" href="#row-long"><span class="caps">Button<span class="sc">.tsx</span></span></a></th>
        <td class="msg"><span>Reject refs beginning with a dash</span></td>
        <td class="age"><time datetime="2025-10-04">14w</time></td>
      </tr>
    </tbody>
  </table>
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

function swatch(fill: string): string {
  const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400"><rect width="1600" height="400" fill="${fill}"/><circle cx="1400" cy="200" r="150" fill="black" fill-opacity="0.35"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(art)}`;
}

const committed: HeaderImage = {
  path: ".carn/header.svg",
  oid: "0".repeat(40),
  bytes: 4096,
};
const darkOnly: HeaderImage = {
  path: ".carn/header-dark.svg",
  oid: "1".repeat(40),
  bytes: 4096,
};

const source = (image: HeaderImage) =>
  swatch(image.path === ".carn/header-dark.svg" ? "#2f2140" : "#f0c8dc");

const identity = html`<section>
  <h2 class="t-l">Repo identity</h2>
  <p class="t-label">Generated wordmark</p>
  ${["linklater", "carn", "gelatinous-cube", "a-very-long-repo-name", "wm"].map(
    (name) =>
      html`<figure>${wordmark(name)}<figcaption class="t-micro">${name}</figcaption></figure>`,
  )}
  <p class="t-label">Committed header, both slots</p>
  ${headerMarkup({
    name: "linklater",
    header: { light: committed, dark: committed },
    src: source,
  })}
  <p class="t-label">Dark header only, wordmark in light</p>
  ${headerMarkup({
    name: "linklater",
    header: { light: "wordmark", dark: darkOnly },
    src: source,
  })}
</section>`;

const body = html`<body>
  <header>
    <a class="skip" href="#main">Skip to content</a>
    <p class="t-micro">Càrn component gallery</p>
  </header>
  <main id="main" tabindex="-1">
    <h1 class="t-xl">Linklater</h1>
    ${type}${buttons}${chips}${rows}${fields}${meta}${tags}${identity}
  </main>
</body>`;

export const galleryCss = `${stylesheet}\n${hoverSimulation}\n${figureFit}`;

// linked when the document is served, because the app's own style-src
// 'self' drops an inline sheet and takes the fonts down with it
export function galleryDocument(cssHref?: string): string {
  const styles =
    cssHref === undefined
      ? `<style>\n${galleryCss}\n</style>`
      : html`<link rel="stylesheet" href="${cssHref}" />`.value;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Component gallery · Càrn</title>
${styles}
</head>
${body.value}
</html>
`;
}

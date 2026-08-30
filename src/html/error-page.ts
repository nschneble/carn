// SPDX-License-Identifier: AGPL-3.0-or-later

import { html } from "./index.js";
import { page } from "./page.js";

export type Failure = {
  title: string;
  heading: string;
  said: string;
  next: string;
};

export const noSuchRepo = (name: string): Failure => ({
  title: `No repo named ${name} · Càrn`,
  heading: "No repo here",
  said: `There's no repo named ${name} on this server.`,
  next: "Find it in all repos.",
});

export const unavailable: Failure = {
  title: "Unavailable · Càrn",
  heading: "Unavailable",
  said: "The page failed to load on the server.",
  next: "Try again shortly.",
};

export const badRepoName: Failure = {
  title: "Not a repo name · Càrn",
  heading: "Not a repo name",
  said: "That URL doesn't carry a repo name this server can look up.",
  next: "A name is letters, digits, dots, dashes, and underscores, up to 64 characters. Check the URL, or find the repo in all repos.",
};

export function errorPage(view: { failure: Failure }): string {
  const { failure } = view;

  return page({
    title: failure.title,
    description: failure.said,
    path: "",
    main: html`<h1 class="t-l">${failure.heading}</h1>
      <div class="empty">
        <p class="t-body">${failure.said}</p>
        <p class="t-body">${failure.next}</p>
        <p><a class="t-mono" href="/">All repos</a></p>
      </div>`,
  });
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { html } from "./index.js";
import { page } from "./page.js";

// og:url is a required Open Graph property, so an error page needs one that
// is true. its own request path would invite indexing a bogus URL, and the
// bare origin would claim the error is the home page. every 404 shares one
// identity and every 503 shares another; neither is a route, so following
// either lands on the page it names
export type Failure = {
  title: string;
  heading: string;
  said: string;
  next: string;
  path: string;
};

export const noSuchRepo = (name: string): Failure => ({
  title: `No repo named ${name} · Càrn`,
  heading: "No repo here",
  said: `There's no repo named ${name} on this server.`,
  next: "Find it in all repos.",
  path: "/404",
});

export const noSuchFile = (path: string): Failure => ({
  title: `No file at ${path} · Càrn`,
  heading: "No file here",
  said: `There's no file at ${path} on that ref.`,
  next: "Check the path and the ref, or browse the repo.",
  path: "/404",
});

export const unavailable: Failure = {
  title: "Unavailable · Càrn",
  heading: "Unavailable",
  said: "The page failed to load on the server.",
  next: "Try again shortly.",
  path: "/503",
};

export const badRepoName: Failure = {
  title: "Not a repo name · Càrn",
  heading: "Not a repo name",
  said: "That URL doesn't carry a repo name this server can look up.",
  next: "A name is letters, digits, dots, dashes, and underscores, up to 40 characters. Check the URL, or find the repo in all repos.",
  path: "/404",
};

export function errorPage(view: { failure: Failure }): string {
  const { failure } = view;

  return page({
    title: failure.title,
    description: failure.said,
    path: failure.path,
    main: html`<h1 class="t-l">${failure.heading}</h1>
      <div class="empty">
        <p class="t-body">${failure.said}</p>
        <p class="t-body">${failure.next}</p>
        <p><a class="t-mono" href="/">All repos</a></p>
      </div>`,
  });
}

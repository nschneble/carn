// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from "../config.js";
import { html, type Raw } from "./index.js";
import { styleHref } from "./styles.js";
import type { Theme } from "./theme.js";

export type Page = {
  title: string;
  theme: Theme | null;
  main: Raw;
};

const head = (title: string) => html`<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="stylesheet" href="${styleHref}" />
</head>`;

const body = (main: Raw) => html`<body>
<header>
<a class="skip" href="#main">Skip to content</a>
<p class="t-mono"><a class="home" href="/">Càrn</a></p>
</header>
<main id="main" tabindex="-1">
${main}</main>
<footer>
<p class="t-mono">Càrn · <a href="${config.sourceUrl}">Source</a> · AGPL-3.0-or-later</p>
</footer>
</body>`;

export function page(view: Page): string {
  const open =
    view.theme === null
      ? html`<html lang="en">`
      : html`<html lang="en" data-theme="${view.theme}">`;

  return `<!doctype html>
${open.value}
${head(view.title).value}
${body(view.main).value}
</html>
`;
}

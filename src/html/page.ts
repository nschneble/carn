// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from "../config.js";
import { html, type Raw } from "./index.js";
import { styleHref } from "./styles.js";

export type Page = {
  title: string;
  description: string;
  path: string;
  main: Raw;
};

const head = (title: string, description: string, path: string) => html`<head>
    <meta charset="utf-8" />
    <title>${title}</title>

    <meta name="description" content="${description}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${config.origin}/images/preview.jpg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${config.origin}/images/preview.jpg" />
    <meta property="og:site_name" content="Càrn" />
    <meta property="og:title" content="${title}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${config.origin}${path}" />

    <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="96x96" href="/images/favicon.png" />
    <link rel="shortcut icon" href="/images/favicon.ico" />
    <link rel="stylesheet" href="${styleHref}" />
  </head>`;

const body = (main: Raw) => html`<body>
    <header>
      <a class="skip" href="#main">Skip to content</a>
      <p class="t-mono"><a class="home" href="/">Càrn</a></p>
    </header>

    <main id="main" tabindex="-1">
      ${main}
    </main>

    <footer>
      <p class="t-mono">Càrn · <a href="${config.sourceUrl}">Source</a> · AGPL-3.0-or-later</p>
    </footer>
  </body>`;

export function page(view: Page): string {
  return `<!doctype html>
<html lang="en">
  ${head(view.title, view.description, view.path).value}
  ${body(view.main).value}
</html>
`;
}

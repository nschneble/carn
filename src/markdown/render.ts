// SPDX-License-Identifier: AGPL-3.0-or-later

// remote https: image urls are permitted here and blocked by csp
// (img-src 'self' data:, src/app.ts). deliberate: the markdown layer
// parses, the response header enforces. a readme's remote image
// degrades to its alt text. see plan.md §04 and the image-proxy note

import MarkdownIt from "markdown-it";
import { type Raw, raw } from "../html/index.js";

const dataImage = /^data:image\/(gif|png|jpeg|webp);/;
const hasScheme = /^[a-z][a-z0-9+.-]*:/;
const allowedScheme = /^(https?|mailto):/;

function allowLink(url: string): boolean {
  const target = url.trim().toLowerCase();

  if (target.startsWith("//")) return false;
  if (dataImage.test(target)) return true;
  if (hasScheme.test(target)) return allowedScheme.test(target);

  return true;
}

const markdown = new MarkdownIt("commonmark", { html: false }).enable("table");

markdown.validateLink = allowLink;

const external = /^https?:/i;
const defaultLinkOpen = markdown.renderer.rules.link_open;

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const href = tokens[index].attrGet("href");

  if (href !== null && external.test(String(href).trim())) {
    tokens[index].attrSet("rel", "nofollow ugc");
  }

  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

// a wide code block scrolls its own container, which needs to be in the
// tab order (wcag scrollable-region-focusable) since nothing inside it is
function focusable(html: string): string {
  return html.replace(/^<pre(?=[ >])/, '<pre tabindex="0"');
}

const defaultFence = markdown.renderer.rules.fence;
const defaultCodeBlock = markdown.renderer.rules.code_block;

markdown.renderer.rules.fence = (tokens, index, options, env, self) =>
  focusable(
    defaultFence
      ? defaultFence(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options),
  );

markdown.renderer.rules.code_block = (tokens, index, options, env, self) =>
  focusable(
    defaultCodeBlock
      ? defaultCodeBlock(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options),
  );

export function renderMarkdown(source: string): Raw {
  return raw(markdown.render(source));
}

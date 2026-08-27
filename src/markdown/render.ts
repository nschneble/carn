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

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href");

  if (href !== null && external.test(String(href).trim())) {
    tokens[idx].attrSet("rel", "nofollow ugc");
  }

  return defaultLinkOpen
    ? defaultLinkOpen(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

export function renderMarkdown(source: string): Raw {
  return raw(markdown.render(source));
}

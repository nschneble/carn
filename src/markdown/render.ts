// SPDX-License-Identifier: AGPL-3.0-or-later

// remote https: image urls are permitted here and blocked by csp
// (img-src 'self' data:, src/app.ts): parse layer and enforcement layer
// disagree on purpose. degrading to alt text is plan.md 04's privacy
// control, and a proxy would serve first-party under csp, not replace it

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
// tab order since nothing inside it is (WCAG scrollable-region-focusable)
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

export function renderPlainText(source: string, limit: number): string {
  const tokens = markdown.parse(source, {});
  let text = "";

  for (const token of tokens) {
    if (token.children === null) continue;

    for (const child of token.children) {
      if (child.type !== "text" && child.type !== "code_inline") continue;
      text += child.content;
    }

    text += " ";
    if (text.length >= limit) break;
  }

  text = text.trim().replace(/\s+/g, " ");
  if (text.length <= limit) return text;

  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");

  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

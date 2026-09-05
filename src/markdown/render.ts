// SPDX-License-Identifier: AGPL-3.0-or-later

// remote http(s) image urls are permitted here and blocked by CSP
// (img-src 'self' data:, src/app.ts): parse layer and enforcement layer
// disagree on purpose. degrading to alt text is PLAN.md 04's privacy
// control, and a proxy would serve first-party under CSP, not replace it

import MarkdownIt, { type Env } from "markdown-it";
import { type Raw, raw } from "../html/index.js";

export type RelativeBase = { repo: string; rev: string };

const dataImage = /^data:image\/(gif|png|jpeg|webp);/;
const hasScheme = /^[a-z][a-z0-9+.-]*:/;
const allowedScheme = /^(https?|mailto):/;
const notAPath = /^[/#?]/;

function allowLink(url: string): boolean {
  const target = url.trim().toLowerCase();

  if (target.startsWith("//")) return false;
  if (dataImage.test(target)) return true;
  if (hasScheme.test(target)) return allowedScheme.test(target);

  return true;
}

const markdown = new MarkdownIt("commonmark", { html: false }).enable("table");
markdown.validateLink = allowLink;

function baseOf(env: Env | undefined): RelativeBase | null {
  const repo = env?.repo;
  const rev = env?.rev;

  if (typeof repo !== "string" || typeof rev !== "string") return null;

  return { repo, rev };
}

// the tree is never consulted: a lookup per destination costs a spawn on a
// link-heavy readme, renders the same readme differently on each ref, and
// only trades a 404 for a link pointing somewhere wrong. markdown-it has
// already encoded the destination, so only the rev is encoded here, and a
// leading ./ goes because validPath refuses a . segment
function rewrite(
  url: string | number | null,
  base: RelativeBase | null,
  route: string,
): string | null {
  if (typeof url !== "string" || url === "" || base === null) return null;
  if (hasScheme.test(url.trim().toLowerCase())) return null;
  if (notAPath.test(url)) return null;

  const path = url.startsWith("./") ? url.slice(2) : url;

  return `/r/${base.repo}/${route}/${encodeURIComponent(base.rev)}/${path}`;
}

const external = /^https?:/i;
const defaultLinkOpen = markdown.renderer.rules.link_open;
const defaultImage = markdown.renderer.rules.image;

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const local = rewrite(token.attrGet("href"), baseOf(env), "blob");

  if (local !== null) token.attrSet("href", local);

  const href = token.attrGet("href");
  if (href !== null && external.test(String(href).trim())) {
    token.attrSet("rel", "nofollow ugc");
  }

  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

markdown.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const local = rewrite(token.attrGet("src"), baseOf(env), "asset");

  if (local !== null) token.attrSet("src", local);

  return defaultImage
    ? defaultImage(tokens, index, options, env, self)
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

export function renderMarkdown(source: string, base: RelativeBase): Raw {
  return raw(markdown.render(source, base));
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

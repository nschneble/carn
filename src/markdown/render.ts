// SPDX-License-Identifier: AGPL-3.0-or-later

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

export function renderMarkdown(source: string): Raw {
  return raw(markdown.render(source));
}

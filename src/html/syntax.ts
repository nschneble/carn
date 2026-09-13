// SPDX-License-Identifier: AGPL-3.0-or-later

// every grammar highlight.js ships, so no blob goes unhighlighted. the
// cost is startup, not the wire: class-based output keeps the theme in
// the cached stylesheet, and all 194 emit 52 classes between them

import hljs from "highlight.js";

import prisma from "../../vendor/prisma.js";

hljs.registerLanguage("prisma", prisma);

export type Language = { id: string; label: string };

// upstream's name, except where it names two languages at once
const labels: Record<string, string> = {
  bash: "Shell",
  ini: "INI",
  prisma: "Prisma",
  xml: "XML",
};

export const languages = new Map<string, Language>(
  hljs
    .listLanguages()
    .map((id) => [
      id,
      { id, label: labels[id] ?? hljs.getLanguage(id)?.name ?? id },
    ]),
);

// two alias tokens are claimed by two grammars, so the winner is chosen
const contested: Record<string, string> = {
  ls: "livescript",
  ml: "ocaml",
};

// extensions no grammar claims as an alias of its own
const unclaimed: Record<string, string> = {
  bashrc: "bash",
  cfg: "ini",
  editorconfig: "ini",
  htm: "xml",
  pyi: "python",
};

const byExtension = new Map<string, string>();

for (const id of hljs.listLanguages()) {
  for (const alias of [id, ...(hljs.getLanguage(id)?.aliases ?? [])]) {
    const key = alias.toLowerCase();
    if (!byExtension.has(key)) byExtension.set(key, id);
  }
}

for (const [alias, id] of Object.entries(contested)) {
  byExtension.set(alias, id);
}

for (const [extension, id] of Object.entries(unclaimed)) {
  byExtension.set(extension, id);
}

// a whole filename, for the files that carry no extension
const byName: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
};

export function languageFor(path: string): Language | null {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  const named = byName[name];
  if (named !== undefined) return languages.get(named) ?? null;

  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;

  const id = byExtension.get(name.slice(dot + 1));
  return id === undefined ? null : (languages.get(id) ?? null);
}

// bounded by bytes, not entries: one blob can be the whole source cap
const cache = new Map<string, string>();
const cacheBytes = 8 * 1024 * 1024;
let held = 0;

function key(oid: string, language: Language | null, bytes: number): string {
  return `${oid}\0${language?.id ?? ""}\0${bytes}`;
}

// the length joins the key: a blob renders at two as the budget moves
export function highlight(options: {
  oid: string;
  source: string;
  language: Language | null;
}): string {
  const { oid, source, language } = options;
  const at = key(oid, language, source.length);

  const known = cache.get(at);
  if (known !== undefined) return known;

  const marked =
    language === null
      ? escapeSource(source)
      : hljs.highlight(source, { language: language.id }).value;

  cache.set(at, marked);
  held += marked.length;

  while (held > cacheBytes && cache.size > 1) {
    const oldest = cache.keys().next();
    if (oldest.done) break;

    held -= cache.get(oldest.value)?.length ?? 0;
    cache.delete(oldest.value);
  }

  return marked;
}

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeSource(source: string): string {
  return source.replace(/[&<>]/g, (char) => entities[char] as string);
}

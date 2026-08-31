// SPDX-License-Identifier: AGPL-3.0-or-later

// only the languages we serve are registered; the full bundle is 190 of
// them. class-based output keeps the theme in the cached stylesheet
// instead of inlining it into every blob

import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

export type Language = { id: string; label: string };

const registry: [Language, unknown][] = [
  [{ id: "bash", label: "Shell" }, bash],
  [{ id: "c", label: "C" }, c],
  [{ id: "cpp", label: "C++" }, cpp],
  [{ id: "css", label: "CSS" }, css],
  [{ id: "diff", label: "Diff" }, diff],
  [{ id: "dockerfile", label: "Dockerfile" }, dockerfile],
  [{ id: "go", label: "Go" }, go],
  [{ id: "ini", label: "INI" }, ini],
  [{ id: "java", label: "Java" }, java],
  [{ id: "javascript", label: "JavaScript" }, javascript],
  [{ id: "json", label: "JSON" }, json],
  [{ id: "markdown", label: "Markdown" }, markdown],
  [{ id: "python", label: "Python" }, python],
  [{ id: "rust", label: "Rust" }, rust],
  [{ id: "sql", label: "SQL" }, sql],
  [{ id: "typescript", label: "TypeScript" }, typescript],
  [{ id: "xml", label: "XML" }, xml],
  [{ id: "yaml", label: "YAML" }, yaml],
];

export const languages = new Map(
  registry.map(([language]) => [language.id, language]),
);

for (const [language, definition] of registry) {
  hljs.registerLanguage(
    language.id,
    definition as Parameters<typeof hljs.registerLanguage>[1],
  );
}

const byExtension: Record<string, string> = {
  bash: "bash",
  bashrc: "bash",
  c: "c",
  cc: "cpp",
  cfg: "ini",
  cjs: "javascript",
  cpp: "cpp",
  css: "css",
  cts: "typescript",
  diff: "diff",
  dockerfile: "dockerfile",
  editorconfig: "ini",
  go: "go",
  h: "c",
  hh: "cpp",
  hpp: "cpp",
  htm: "xml",
  html: "xml",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  markdown: "markdown",
  md: "markdown",
  mjs: "javascript",
  mts: "typescript",
  py: "python",
  pyi: "python",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  svg: "xml",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  xhtml: "xml",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

const byName: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "bash",
};

export function languageFor(path: string): Language | null {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  const named = byName[name];
  if (named !== undefined) return languages.get(named) ?? null;

  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;

  const id = byExtension[name.slice(dot + 1)];
  return id === undefined ? null : (languages.get(id) ?? null);
}

// bounded by what it holds, not by how many: one entry runs to the whole
// source cap, so a count would let a few big blobs take tens of megabytes
const cache = new Map<string, string>();
const cacheBytes = 8 * 1024 * 1024;
let held = 0;

function key(oid: string, language: Language | null, bytes: number): string {
  return `${oid}\0${language?.id ?? ""}\0${bytes}`;
}

// blob content is oid-addressed and highlighting is pure, so a repeat view
// costs a map read; the truncated length joins the key because a blob can
// render at two lengths as the budget moves
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

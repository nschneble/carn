// SPDX-License-Identifier: AGPL-3.0-or-later

// light and dark each walk the same chain at the default branch tip and
// take the first match, so a repo with only a dark header still looks
// deliberate in light mode. one ls-tree per page, cached on the tip's
// OID. BRAND.md 06

import { oidPattern } from "../git/oid.js";
import { spawnGit } from "../git/spawn.js";
import { html, type Raw } from "../html/index.js";
import { wordmark } from "./wordmark.js";

export type Slot = "light" | "dark";
export type HeaderImage = { path: string; oid: string; bytes: number };
export type HeaderSource = HeaderImage | "wordmark";
export type Header = { light: HeaderSource; dark: HeaderSource };

export type HeaderSrc = (image: HeaderImage) => string;

// what the 100 KB page budget leaves once the fonts and the document are
// paid for. BRAND.md 06
export const maxHeaderBytes = 16 * 1024;

const listTimeoutMs = 5_000;
const fileModes: ReadonlySet<string> = new Set(["100644", "100755"]);
const cacheLimit = 512;

const cache = new Map<string, Header>();

function chain(slot: Slot): string[] {
  return [`.carn/header-${slot}.svg`, ".carn/header.svg"];
}

function parse(listing: string): Map<string, HeaderImage> {
  const found = new Map<string, HeaderImage>();

  for (const record of listing.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab === -1) continue;

    const [mode, type, oid, size] = record.slice(0, tab).split(/\s+/);
    const path = record.slice(tab + 1);
    const bytes = Number(size);

    if (type !== "blob" || mode === undefined || !fileModes.has(mode)) continue;
    if (oid === undefined || !Number.isInteger(bytes) || bytes > maxHeaderBytes)
      continue;

    found.set(path, { path, oid, bytes });
  }

  return found;
}

async function list(
  repoPath: string,
  commit: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const child = await spawnGit({
    args: ["ls-tree", "-z", "--long", commit, "--", ".carn/"],
    cwd: repoPath,
    signal,
    timeoutMs: listTimeoutMs,
  });

  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  child.stderr.resume();

  const result = await child.done;
  if (result.outcome !== "exited" || result.code !== 0) {
    throw new Error(
      `git ls-tree of .carn/ at ${commit} ${result.outcome} (${result.code})`,
    );
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function walk(
  repoPath: string,
  commit: string,
  signal: AbortSignal | undefined,
): Promise<Header> {
  const found = parse(await list(repoPath, commit, signal));
  const pick = (slot: Slot): HeaderSource => {
    for (const candidate of chain(slot)) {
      const image = found.get(candidate);
      if (image !== undefined) return image;
    }
    return "wordmark";
  };

  return { light: pick("light"), dark: pick("dark") };
}

// caching the promise would hand one caller's abort to every other
export async function resolveHeader(options: {
  repoPath: string;
  commit: string | null;
  signal?: AbortSignal;
}): Promise<Header> {
  if (options.commit === null) {
    return { light: "wordmark", dark: "wordmark" };
  }

  if (!oidPattern.test(options.commit)) {
    throw new Error(
      `header resolution needs an object id, got ${options.commit}`,
    );
  }

  const key = `${options.repoPath}\0${options.commit}`;
  const known = cache.get(key);
  if (known !== undefined) return known;

  const header = await walk(options.repoPath, options.commit, options.signal);
  cache.set(key, header);

  if (cache.size > cacheLimit) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  return header;
}

function same(header: Header): boolean {
  if (header.light === "wordmark" || header.dark === "wordmark") {
    return header.light === header.dark;
  }

  return header.light.path === header.dark.path;
}

function slot(name: string, source: HeaderSource, src: HeaderSrc): Raw {
  return source === "wordmark"
    ? wordmark(name)
    : html`<img class="hdr" src="${src(source)}" alt="" />`;
}

export function headerMarkup(options: {
  name: string;
  header: Header;
  src: HeaderSrc;
}): Raw {
  const { name, header, src } = options;

  if (same(header)) return slot(name, header.light, src);

  if (header.light !== "wordmark" && header.dark !== "wordmark") {
    return html`<picture><source srcset="${src(header.dark)}" media="(prefers-color-scheme: dark)" /><img class="hdr" src="${src(header.light)}" alt="" /></picture>`;
  }

  return html`<span class="hdr-light">${slot(name, header.light, src)}</span><span class="hdr-dark">${slot(name, header.dark, src)}</span>`;
}

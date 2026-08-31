// SPDX-License-Identifier: AGPL-3.0-or-later

// one ls-tree scoped to the path, then one cat-file: two spawns whatever
// the file's size, because the read is capped and the truncation happens
// on the source rather than on the rendered markup

import { readBlob } from "../git/blob.js";
import { captureGit } from "../git/capture.js";
import { parseLsTree } from "../git/ls-tree.js";
import { type RasterFormat, sniffRaster } from "./blob-asset.js";

export type BlobKind = "text" | "raster" | "binary";

export type BlobEntry = { oid: string; bytes: number };

export type BlobView = {
  rev: string;
  path: string;
  oid: string;
  bytes: number;
  kind: BlobKind;
  format: RasterFormat | null;
  source: string | null;
  lines: number;
  whole: boolean;
};

export const blobTimeoutMs = 5_000;

// above this a text blob cannot state its own line count without being
// buffered whole, so it reports its size instead of truncating
export const maxSourceBytes = 8 * 1024 * 1024;

// git's own heuristic: a NUL in the first 8000 bytes
const sniffBytes = 8000;

const revPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

export function validRev(rev: string): boolean {
  if (!revPattern.test(rev)) return false;
  return !rev.includes("..") && !rev.endsWith("/") && !rev.endsWith(".lock");
}

export function validPath(path: string): boolean {
  if (path === "" || path.length > 4096) return false;
  if (path.startsWith("/") || path.endsWith("/")) return false;

  return path
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
}

function binary(body: Buffer): boolean {
  return body.subarray(0, sniffBytes).includes(0);
}

export function countLines(source: string): number {
  if (source === "") return 0;

  const breaks = source.split("\n").length;
  return source.endsWith("\n") ? breaks - 1 : breaks;
}

export async function findBlobEntry(options: {
  repoPath: string;
  rev: string;
  path: string;
  signal?: AbortSignal;
}): Promise<BlobEntry | null> {
  if (!validRev(options.rev) || !validPath(options.path)) return null;

  const { code, stdout } = await captureGit({
    args: [
      "ls-tree",
      "-z",
      "--long",
      "--end-of-options",
      options.rev,
      "--",
      options.path,
    ],
    cwd: options.repoPath,
    signal: options.signal,
    timeoutMs: blobTimeoutMs,
  });

  if (code !== 0) return null;

  for (const entry of parseLsTree(stdout.toString("utf8"))) {
    if (entry.type !== "blob" || entry.path !== options.path) continue;
    if (entry.size === null) continue;

    return { oid: entry.oid, bytes: entry.size };
  }

  return null;
}

export async function loadBlobView(options: {
  repoPath: string;
  rev: string;
  path: string;
  signal?: AbortSignal;
}): Promise<BlobView | null> {
  const { repoPath, rev, path, signal } = options;

  const entry = await findBlobEntry({ repoPath, rev, path, signal });
  if (entry === null) return null;

  const body = await readBlob({
    repoPath,
    oid: entry.oid,
    limit: maxSourceBytes,
    signal,
  });

  const whole = entry.bytes <= maxSourceBytes;
  const shell = { rev, path, oid: entry.oid, bytes: entry.bytes, whole };
  const format = sniffRaster(body);

  if (format !== null) {
    return { ...shell, kind: "raster", format, source: null, lines: 0 };
  }

  if (binary(body)) {
    return { ...shell, kind: "binary", format: null, source: null, lines: 0 };
  }

  if (!whole) {
    return { ...shell, kind: "text", format: null, source: null, lines: 0 };
  }

  const source = body.toString("utf8");

  return {
    ...shell,
    kind: "text",
    format: null,
    source,
    lines: countLines(source),
  };
}

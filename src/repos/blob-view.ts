// SPDX-License-Identifier: AGPL-3.0-or-later

// uses only two spawns to find and render blobs of any size; reads are
// capped and the page budget truncation is based off the source

import { blobTimeoutMs, readBlob } from "../git/blob.js";
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
  whole: boolean;
  format: RasterFormat | null;
  kind: BlobKind;
  source: string | null;
  lines: number;
};

// past this a blob reports its size rather than buffering to count lines
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

  const oid = entry.oid;
  const bytes = entry.bytes;
  const whole = entry.bytes <= maxSourceBytes;
  const format = sniffRaster(body);
  const kind = format ? "raster" : binary(body) ? "binary" : "text";
  const source = kind === "text" && whole ? body.toString("utf8") : null;
  const lines = source ? countLines(source) : 0;

  return { rev, path, oid, bytes, whole, format, kind, source, lines };
}

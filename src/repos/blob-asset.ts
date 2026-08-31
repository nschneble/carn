// SPDX-License-Identifier: AGPL-3.0-or-later

// the same content-addressed immutable shape as the header route, with a
// raster-only allowlist. an svg blob is repo-controlled active content and
// its <title>/<text> would enter the host page's accessibility tree, so it
// is never served here and never inlined

import { oidSource } from "../git/oid.js";

export type RasterFormat = { extension: string; type: string };

export type BlobAsset = { oid: string; format: RasterFormat };

const formats: RasterFormat[] = [
  { extension: "png", type: "image/png" },
  { extension: "jpg", type: "image/jpeg" },
  { extension: "gif", type: "image/gif" },
  { extension: "webp", type: "image/webp" },
];

const byExtension = new Map(
  formats.map((format) => [format.extension, format]),
);

const assetPattern = new RegExp(`^(${oidSource})\\.([a-z0-9]+)$`);

export function blobAssetPath(repo: string, asset: BlobAsset): string {
  return `/r/${repo}/blob-asset/${asset.oid}.${asset.format.extension}`;
}

export function parseBlobAsset(asset: string): BlobAsset | null {
  const found = assetPattern.exec(asset);
  if (found === null) return null;

  const format = byExtension.get(found[2] as string);
  if (format === undefined) return null;

  return { oid: found[1] as string, format };
}

function starts(body: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => body[index] === byte);
}

// magic bytes, never the extension: a committed file can claim anything
export function sniffRaster(body: Buffer): RasterFormat | null {
  if (starts(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return byExtension.get("png") ?? null;
  }

  if (starts(body, [0xff, 0xd8, 0xff])) return byExtension.get("jpg") ?? null;

  if (starts(body, [0x47, 0x49, 0x46, 0x38])) {
    return byExtension.get("gif") ?? null;
  }

  if (
    starts(body, [0x52, 0x49, 0x46, 0x46]) &&
    body.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return byExtension.get("webp") ?? null;
  }

  return null;
}

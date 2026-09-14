// SPDX-License-Identifier: AGPL-3.0-or-later

// the same content-addressed immutable shape as the header route, with a
// raster-only allowlist; an svg blob is repo-controlled active content and
// its <title>/<text> would enter the host page's a11y tree, so it's never
// served here and never inlined

import { oidSource } from "../git/oid.js";

export type RasterFormat = {
  extension: string;
  type: string;
  bytes: (number | null)[];
};

export type BlobAsset = { oid: string; format: RasterFormat };

// a null is a wildcard: webp's four size bytes sit between RIFF and WEBP
const formats: RasterFormat[] = [
  { extension: "gif", type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { extension: "jpg", type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  {
    extension: "png",
    type: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    extension: "webp",
    type: "image/webp",
    bytes: [
      0x52,
      0x49,
      0x46,
      0x46,
      null,
      null,
      null,
      null,
      0x57,
      0x45,
      0x42,
      0x50,
    ],
  },
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

function starts(body: Buffer, bytes: (number | null)[]): boolean {
  return bytes.every((byte, index) => byte === null || body[index] === byte);
}

// magic bytes, never the extension: a committed file can claim anything
export function sniffRaster(body: Buffer): RasterFormat | null {
  return formats.find((format) => starts(body, format.bytes)) ?? null;
}

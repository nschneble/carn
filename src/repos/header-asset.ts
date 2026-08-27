// SPDX-License-Identifier: AGPL-3.0-or-later

// the url is content-addressed, so it can be immutable, and the route
// checks the oid against the repo's own resolved slots before serving

import type { HeaderImage } from "./header.js";

export type HeaderAsset = { oid: string; extension: ".png" | ".svg" };

const assetPattern = /^([0-9a-f]{40}(?:[0-9a-f]{24})?)(\.png|\.svg)$/;

export const headerTypes: Record<HeaderAsset["extension"], string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function headerExtension(path: string): HeaderAsset["extension"] {
  return path.endsWith(".svg") ? ".svg" : ".png";
}

export function headerAssetPath(repo: string, image: HeaderImage): string {
  return `/r/${repo}/header/${image.oid}${headerExtension(image.path)}`;
}

export function parseHeaderAsset(asset: string): HeaderAsset | null {
  const found = assetPattern.exec(asset);
  if (found === null) return null;

  return {
    oid: found[1] as string,
    extension: found[2] as HeaderAsset["extension"],
  };
}

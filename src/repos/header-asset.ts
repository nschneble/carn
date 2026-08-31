// SPDX-License-Identifier: AGPL-3.0-or-later

// the url is content-addressed, so it can be immutable, and the route
// checks the oid against the repo's own resolved slots before serving

import { oidSource } from "../git/oid.js";
import type { HeaderImage } from "./header.js";

export type HeaderAsset = { oid: string };

const assetPattern = new RegExp(`^(${oidSource})\\.svg$`);

export const headerType = "image/svg+xml";

export function headerAssetPath(repo: string, image: HeaderImage): string {
  return `/r/${repo}/header/${image.oid}.svg`;
}

export function parseHeaderAsset(asset: string): HeaderAsset | null {
  const found = assetPattern.exec(asset);
  if (found === null) return null;

  return { oid: found[1] as string };
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { readBlob } from "../git/blob.js";
import type { TreeEntry } from "./tree.js";

export type License = { spdx: string | null };

export const maxLicenseBytes = 4 * 1024;

// the British spelling is a filename on disk, not prose of ours
const licenseNames = new Set([
  "license",
  "license.md",
  "license.txt",
  "licence",
  "licence.md",
  "licence.txt",
  "copying",
  "copying.md",
  "copying.txt",
  "unlicense",
]);

// ordered for correctness; AGPL and LGPL must precede GPL
const marks: [string, string][] = [
  ["GNU AFFERO GENERAL PUBLIC LICENSE", "AGPL"],
  ["GNU LESSER GENERAL PUBLIC LICENSE", "LGPL"],
  ["GNU GENERAL PUBLIC LICENSE", "GPL"],
  ["Apache License", "Apache-2.0"],
  ["Mozilla Public License", "MPL"],
  ["Permission is hereby granted, free of charge", "MIT"],
  ["Permission to use, copy, modify, and/or distribute", "ISC"],
  ["Redistribution and use in source and binary forms", "BSD"],
  [
    "free and unencumbered software released into the public domain",
    "Unlicense",
  ],
];

export function findLicense(entries: TreeEntry[]): TreeEntry | null {
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    if (!licenseNames.has(entry.name.toLowerCase())) continue;
    return entry;
  }

  return null;
}

export async function readLicense(options: {
  repoPath: string;
  oid: string;
  signal?: AbortSignal;
}): Promise<License> {
  const body = await readBlob({
    repoPath: options.repoPath,
    oid: options.oid,
    limit: maxLicenseBytes,
    signal: options.signal,
  });

  const bodyString = body.toString("utf8");
  for (const mark of marks) {
    if (!bodyString.toLowerCase().includes(mark[0].toLowerCase())) continue;

    if (mark[1].search(/(GPL|MPL)/) > -1) {
      const found = /Version (\d+(?:\.\d+)?)/.exec(bodyString);
      const version = found
        ? Number.parseFloat(found[1] as string)
        : Number.NaN;
      return {
        spdx: Number.isFinite(version)
          ? `${mark[1]}-${version.toFixed(1)}`
          : null,
      };
    }

    if (mark[1].indexOf("BSD") > -1) {
      if (bodyString.indexOf("Neither the name of") > -1)
        return { spdx: "BSD-3-Clause" };
      return { spdx: "BSD-2-Clause" };
    }

    return { spdx: mark[1] };
  }

  return { spdx: null };
}

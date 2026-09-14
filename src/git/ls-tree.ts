// SPDX-License-Identifier: AGPL-3.0-or-later

export type LsTreeEntry = {
  mode: string;
  type: string;
  oid: string;
  size: number | null;
  path: string;
};

// -z --long both, or every size silently reads back null
export function parseLsTree(listing: string): LsTreeEntry[] {
  const entries: LsTreeEntry[] = [];

  for (const record of listing.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab === -1) continue;

    const [mode, type, oid, size] = record.slice(0, tab).split(/\s+/);
    const path = record.slice(tab + 1);

    if (mode === undefined || type === undefined || oid === undefined) continue;
    if (path === "") continue;

    const bytes = Number(size);
    entries.push({
      mode,
      type,
      oid,
      size: Number.isInteger(bytes) ? bytes : null,
      path,
    });
  }

  return entries;
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { type Header, resolveHeader } from "./header.js";
import { findLicense, type License, readLicense } from "./license.js";
import { findReadme, readReadme } from "./readme.js";
import type { ResolvedRepo } from "./resolve.js";
import { listTree, resolveTip, type TreeEntry } from "./tree.js";

export type RepoView = {
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  branch: string;
  tip: string | null;
  header: Header;
  entries: TreeEntry[];
  readme: string | null;
  license: License | null;
};

export async function loadRepoView(options: {
  repo: ResolvedRepo;
  signal?: AbortSignal;
}): Promise<RepoView> {
  const { repo, signal } = options;

  const tip = await resolveTip({
    repoPath: repo.path,
    branch: repo.defaultBranch,
    signal,
  });

  const shell = {
    name: repo.name,
    description: repo.description,
    createdAt: repo.createdAt,
    updatedAt: tip?.at ?? null,
    branch: repo.defaultBranch,
    tip: tip?.oid ?? null,
  };

  if (tip === null) {
    return {
      ...shell,
      header: await resolveHeader({ repoPath: repo.path, commit: null }),
      entries: [],
      readme: null,
      license: null,
    };
  }

  const [header, tree] = await Promise.all([
    resolveHeader({ repoPath: repo.path, commit: tip.oid, signal }),
    listTree({ repoPath: repo.path, rev: tip.oid, signal }),
  ]);

  const entries = tree?.entries ?? [];
  const readmeEntry = findReadme(entries);
  const licenseEntry = findLicense(entries);

  const [readme, license] = await Promise.all([
    readmeEntry
      ? readReadme({ repoPath: repo.path, oid: readmeEntry.oid, signal })
      : null,
    licenseEntry
      ? readLicense({ repoPath: repo.path, oid: licenseEntry.oid, signal })
      : null,
  ]);

  return { ...shell, header, entries, readme, license };
}

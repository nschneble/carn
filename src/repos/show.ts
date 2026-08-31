// SPDX-License-Identifier: AGPL-3.0-or-later

import { type Header, resolveHeader } from "./header.js";
import { findReadme, readReadme } from "./readme.js";
import type { ResolvedRepo } from "./resolve.js";
import { listTree, resolveTip, type TreeEntry } from "./tree.js";

export type RepoView = {
  name: string;
  branch: string;
  tip: string | null;
  header: Header;
  entries: TreeEntry[];
  readme: string | null;
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

  const shell = { name: repo.name, branch: repo.defaultBranch, tip };

  if (tip === null) {
    return {
      ...shell,
      header: await resolveHeader({ repoPath: repo.path, commit: null }),
      entries: [],
      readme: null,
    };
  }

  const [header, tree] = await Promise.all([
    resolveHeader({ repoPath: repo.path, commit: tip, signal }),
    listTree({ repoPath: repo.path, rev: tip, signal }),
  ]);

  const entries = tree?.entries ?? [];
  const found = findReadme(entries);

  return {
    ...shell,
    header,
    entries,
    readme:
      found === null
        ? null
        : await readReadme({ repoPath: repo.path, oid: found.oid, signal }),
  };
}

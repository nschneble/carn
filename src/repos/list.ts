// SPDX-License-Identifier: AGPL-3.0-or-later

// the index is uncapped at MLP. the file tree's sixteen-row cap reasons
// about repo-root entry counts and does not transfer to how many repos an
// install has. when one outgrows a page the answer is pagination on
// rev-list --count (PLAN.md 215), never a cap borrowed from the tree

import { db } from "../db.js";

export type RepoSummary = {
  name: string;
  description: string | null;
  createdAt: Date;
};

export async function listRepos(): Promise<RepoSummary[]> {
  return db.$queryRaw<RepoSummary[]>`
    SELECT name, description, created_at AS "createdAt"
    FROM repos
    ORDER BY lower(name)
  `;
}

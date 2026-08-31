// SPDX-License-Identifier: AGPL-3.0-or-later

// index returns all repos, but if we get to a point where we need to
// paginate, we can do a keyset cursor on lower(name)

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

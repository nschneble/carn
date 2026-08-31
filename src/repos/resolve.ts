// SPDX-License-Identifier: AGPL-3.0-or-later

import { join } from "node:path";

import { config } from "../config.js";
import { db } from "../db.js";

export const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export type ResolvedRepo = {
  id: string;
  name: string;
  ownerId: string;
  defaultBranch: string;
  path: string;
};

export type RepoLookup =
  | { status: "invalid" }
  | { status: "missing"; name: string }
  | { status: "found"; repo: ResolvedRepo };

export function repoPath(id: string): string {
  return join(config.repoRoot, id.slice(0, 2), `${id}.git`);
}

export async function resolveRepo(target: string): Promise<RepoLookup> {
  const name = target.replace(/^\//, "").replace(/\.git$/, "");
  if (!namePattern.test(name)) {
    return { status: "invalid" };
  }

  // raw: prisma's insensitive equals emits ILIKE, where _ is a wildcard
  const rows = await db.$queryRaw<Omit<ResolvedRepo, "path">[]>`
    SELECT id, name, owner_id AS "ownerId", default_branch AS "defaultBranch"
    FROM repos
    WHERE lower(name) = lower(${name})
  `;

  const row = rows[0];
  if (row === undefined) {
    return { status: "missing", name };
  }

  return { status: "found", repo: { ...row, path: repoPath(row.id) } };
}

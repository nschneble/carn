// SPDX-License-Identifier: AGPL-3.0-or-later

// the disk path derives from the primary key, so a rename is one UPDATE
// and nothing on disk moves

import { db, isUniqueViolation } from "../db.js";

export type RepoRename = { status: "renamed" } | { status: "taken" };

export async function renameRepo(
  id: string,
  name: string,
): Promise<RepoRename> {
  try {
    await db.repo.update({ where: { id }, data: { name } });
    return { status: "renamed" };
  } catch (error) {
    // a concurrent rename can take the name after the caller's check
    if (isUniqueViolation(error)) return { status: "taken" };
    throw error;
  }
}

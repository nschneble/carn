// SPDX-License-Identifier: AGPL-3.0-or-later

// determines who has repo write access, starting with owners and then
// onto admins and grants

import { db } from "../db.js";
import type { GrantLevel } from "../generated/prisma/client.js";
import type { ResolvedRepo } from "./resolve.js";

// which levels answer which question is the policy, and it lives here
const writeLevels: readonly GrantLevel[] = ["admin", "write"];
const adminLevels: readonly GrantLevel[] = ["admin"];

export type AccessStore = {
  isAdminOrGranted(
    userId: string,
    repoId: string,
    levels: readonly GrantLevel[],
  ): Promise<boolean>;
};

export const accessStore: AccessStore = {
  isAdminOrGranted: async (userId, repoId, levels) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        isAdmin: true,
        grants: {
          where: { repoId, level: { in: [...levels] } },
          select: { repoId: true },
          take: 1,
        },
      },
    });

    // no row means the user was deleted mid-connection: always refuse
    return user?.isAdmin === true || (user?.grants.length ?? 0) > 0;
  },
};

export async function mayWrite(
  repo: ResolvedRepo,
  userId: string,
  store: AccessStore = accessStore,
): Promise<boolean> {
  if (repo.ownerId === userId) return true;
  return store.isAdminOrGranted(userId, repo.id, writeLevels);
}

// a write grant can push; changing the public url takes an admin grant
export async function mayAdminister(
  repo: ResolvedRepo,
  userId: string,
  store: AccessStore = accessStore,
): Promise<boolean> {
  if (repo.ownerId === userId) return true;
  return store.isAdminOrGranted(userId, repo.id, adminLevels);
}

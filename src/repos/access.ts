// SPDX-License-Identifier: AGPL-3.0-or-later

// who may write to a repo. three ways in, checked cheapest first: the owner
// needs no query at all, and admin and grant are one round trip together.
// the policy lives here rather than at the call site so the ssh path and
// whatever asks next give the same answer

import { db } from "../db.js";
import type { ResolvedRepo } from "./resolve.js";

// the levels that carry write. `read` exists in the enum's future, not here
const writeLevels = ["admin", "write"] as const;

export type AccessStore = {
  isAdminOrGranted(userId: string, repoId: string): Promise<boolean>;
};

export const accessStore: AccessStore = {
  isAdminOrGranted: async (userId, repoId) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        isAdmin: true,
        grants: {
          where: { repoId, level: { in: [...writeLevels] } },
          select: { repoId: true },
          take: 1,
        },
      },
    });

    // a userId with no row is an authenticated session whose user was
    // deleted mid-connection; absence is a refusal, not an error
    return user?.isAdmin === true || (user?.grants.length ?? 0) > 0;
  },
};

export async function mayWrite(
  repo: ResolvedRepo,
  userId: string,
  store: AccessStore = accessStore,
): Promise<boolean> {
  if (repo.ownerId === userId) {
    return true;
  }

  return store.isAdminOrGranted(userId, repo.id);
}

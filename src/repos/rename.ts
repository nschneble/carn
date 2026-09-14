// SPDX-License-Identifier: AGPL-3.0-or-later

// the disk path derives from the primary key, so a rename is one UPDATE
// and nothing on disk moves

import { db } from "../db.js";

export async function renameRepo(id: string, name: string): Promise<void> {
  await db.repo.update({ where: { id }, data: { name } });
}

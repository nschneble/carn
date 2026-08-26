// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdirSync } from "node:fs";

import { db } from "../db.js";
import { runGit } from "../git/spawn.js";
import { type ResolvedRepo, repoPath } from "./resolve.js";

const timeoutMs = 10_000;
// git init queues on the semaphore; prisma's 5s default rolls it back
const transactionMs = 60_000;

const gitConfig: [string, string][] = [
  ["core.logAllRefUpdates", "true"],
  ["pack.threads", "1"],
  ["pack.windowMemory", "64m"],
  ["receive.autogc", "false"],
  ["receive.maxInputSize", "100m"],
];

export async function createRepo(
  name: string,
  ownerId: string,
): Promise<ResolvedRepo> {
  return db.$transaction(
    async (tx) => {
      const row = await tx.repo.create({
        data: { name, ownerId },
        select: { id: true, name: true, ownerId: true, defaultBranch: true },
      });
      const path = repoPath(row.id);

      mkdirSync(path, { recursive: true });
      await runGit({
        args: ["init", "--bare", `--initial-branch=${row.defaultBranch}`],
        cwd: path,
        timeoutMs,
      });

      for (const [key, value] of gitConfig) {
        await runGit({ args: ["config", key, value], cwd: path, timeoutMs });
      }

      return { ...row, path };
    },
    { timeout: transactionMs },
  );
}

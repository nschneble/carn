// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { db } from "../db.js";
import { type ResolvedRepo, repoPath } from "./resolve.js";

const timeoutMs = 10_000;

const gitConfig: [string, string][] = [
  ["core.logAllRefUpdates", "true"],
  ["pack.threads", "1"],
  ["pack.windowMemory", "64m"],
  ["receive.autogc", "false"],
  ["receive.maxInputSize", "100m"],
];

// temporary: git/spawn.ts is not written yet and owns every other call
function git(args: string[], cwd: string): void {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${result.status}: ${result.stderr.trim()}`,
    );
  }
}

export async function createRepo(
  name: string,
  ownerId: string,
): Promise<ResolvedRepo> {
  return db.$transaction(async (tx) => {
    const row = await tx.repo.create({
      data: { name, ownerId },
      select: { id: true, name: true, ownerId: true, defaultBranch: true },
    });
    const path = repoPath(row.id);

    mkdirSync(path, { recursive: true });
    git(["init", "--bare", `--initial-branch=${row.defaultBranch}`], path);

    for (const [key, value] of gitConfig) {
      git(["config", key, value], path);
    }

    return { ...row, path };
  });
}

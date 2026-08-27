// SPDX-License-Identifier: AGPL-3.0-or-later

// the visual harness's reset: the pinned rows, and the pinned bare repos
// unpacked beside them. tuffgal calls it once per breakpoint pass. both
// halves are destructive, so both refuse to run anywhere but the harness's
// own database and its own repo root

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "../../src/config.js";
import { db } from "../../src/db.js";
import {
  fixtureRepos,
  visualDatabase,
  visualRepoRoot,
} from "./fixture-repos.js";

const tarball = resolve(
  import.meta.dirname,
  "../../../test/fixtures/repos.tar",
);

function guard(): string {
  const name = new URL(config.databaseUrl).pathname.replace(/^\//, "");

  if (name !== visualDatabase) {
    throw new Error(
      `refusing to reset database "${name}"; only "${visualDatabase}" is the harness's own`,
    );
  }

  const root = resolve(config.repoRoot);

  if (!root.endsWith(`/${visualRepoRoot}`)) {
    throw new Error(
      `refusing to erase repo root "${root}"; only a path ending in "${visualRepoRoot}" is the harness's own`,
    );
  }

  return root;
}

async function ownerId(): Promise<string> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE handle = 'nschneble'
  `;
  const row = rows[0];

  if (row === undefined) {
    throw new Error("the harness database has no admin row to own the repos");
  }

  return row.id;
}

export async function resetVisualState(): Promise<void> {
  const root = guard();
  const owner = await ownerId();

  await db.$executeRaw`TRUNCATE TABLE repos RESTART IDENTITY CASCADE`;

  for (const repo of fixtureRepos) {
    await db.$executeRaw`
      INSERT INTO repos (id, owner_id, name, description, created_at)
      VALUES (
        ${repo.id}::uuid,
        ${owner}::uuid,
        ${repo.name},
        ${repo.description},
        ${new Date(repo.createdAt)}
      )
    `;
  }

  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  execFileSync("tar", ["-xf", tarball, "-C", root]);
}

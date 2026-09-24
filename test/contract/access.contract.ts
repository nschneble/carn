// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import type { GrantLevel } from "../../src/generated/prisma/client.js";
import {
  type AccessStore,
  mayAdminister,
  mayWrite,
} from "../../src/repos/access.js";
import type { ResolvedRepo } from "../../src/repos/resolve.js";

const ownerId = "3a7d51c8-0000-4000-8000-000000000001";
const otherId = "3a7d51c8-0000-4000-8000-000000000002";
const repoId = "3a7d51c8-0000-4000-8000-0000000000a1";

const repo: ResolvedRepo = {
  id: repoId,
  name: "carn",
  description: "A self-hosted git forge.",
  createdAt: new Date(),
  ownerId,
  defaultBranch: "main",
  path: `/var/lib/carn/repos/3a/${repoId}.git`,
};

const writeQuestion: readonly GrantLevel[] = ["admin", "write"];
const adminQuestion: readonly GrantLevel[] = ["admin"];

type Caller = { isAdmin?: boolean; grant?: GrantLevel };
type Question = {
  userId: string;
  repoId: string;
  levels: readonly GrantLevel[];
};

// answers the way accessStore does, off the levels the question named, so
// mayWrite and mayAdminister can't be told apart by the answer alone
function store(caller: Caller): AccessStore & { asked: Question[] } {
  const asked: Question[] = [];

  return {
    asked,
    isSiteAdminOrGranted: (
      userId: string,
      id: string,
      levels: readonly GrantLevel[],
    ) => {
      asked.push({ userId, repoId: id, levels });
      const granted =
        caller.grant !== undefined && levels.includes(caller.grant);
      return Promise.resolve(caller.isAdmin === true || granted);
    },
  };
}

test("the owner may write without the store being consulted", async () => {
  const access = store({});
  assert.strictEqual(await mayWrite(repo, ownerId, access), true);
  assert.deepStrictEqual(access.asked, [], "an owner push cost a query");
});

test("an admin who isn't the owner may write, on one question", async () => {
  const access = store({ isAdmin: true });

  assert.strictEqual(await mayWrite(repo, otherId, access), true);
  assert.strictEqual(
    access.asked.length,
    1,
    "a non-owner check is exactly one question",
  );
});

test("a grant is checked against the repo being written to", async () => {
  const access = store({ grant: "write" });
  assert.strictEqual(await mayWrite(repo, otherId, access), true);
  assert.deepStrictEqual(access.asked, [
    { userId: otherId, repoId, levels: writeQuestion },
  ]);
});

test("a user with neither admin nor a grant is refused", async () => {
  const access = store({});
  assert.strictEqual(await mayWrite(repo, otherId, access), false);
  assert.strictEqual(access.asked.length, 1);
});

test("the owner may administer without the store being consulted", async () => {
  const access = store({});
  assert.strictEqual(await mayAdminister(repo, ownerId, access), true);
  assert.deepStrictEqual(access.asked, [], "an owner rename cost a query");
});

test("a write grant may push but may not administer", async () => {
  const access = store({ grant: "write" });

  assert.strictEqual(await mayWrite(repo, otherId, access), true);
  assert.strictEqual(await mayAdminister(repo, otherId, access), false);
  assert.deepStrictEqual(
    access.asked.map((question) => question.levels),
    [writeQuestion, adminQuestion],
    "the two checks asked the same question",
  );
});

test("an admin grant may do both", async () => {
  const access = store({ grant: "admin" });

  assert.strictEqual(await mayWrite(repo, otherId, access), true);
  assert.strictEqual(await mayAdminister(repo, otherId, access), true);
});

test("a site admin may do both, holding no grant at all", async () => {
  const access = store({ isAdmin: true });

  assert.strictEqual(await mayWrite(repo, otherId, access), true);
  assert.strictEqual(await mayAdminister(repo, otherId, access), true);
});

test("a caller with no ownership, flag, or grant does neither", async () => {
  const access = store({});

  assert.strictEqual(await mayWrite(repo, otherId, access), false);
  assert.strictEqual(await mayAdminister(repo, otherId, access), false);
});

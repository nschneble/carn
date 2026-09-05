// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import { type AccessStore, mayWrite } from "../../src/repos/access.js";
import type { ResolvedRepo } from "../../src/repos/resolve.js";

const ownerId = "3a7d51c8-0000-4000-8000-000000000001";
const otherId = "3a7d51c8-0000-4000-8000-000000000002";
const repoId = "3a7d51c8-0000-4000-8000-0000000000a1";

const repo: ResolvedRepo = {
  id: repoId,
  name: "carn",
  description: "A self-hosted git forge.",
  ownerId,
  defaultBranch: "main",
  path: `/var/lib/carn/repos/3a/${repoId}.git`,
};

type Question = { userId: string; repoId: string };

function store(answer: boolean): AccessStore & { asked: Question[] } {
  const asked: Question[] = [];

  return {
    asked,
    isAdminOrGranted: (userId: string, id: string) => {
      asked.push({ userId, repoId: id });
      return Promise.resolve(answer);
    },
  };
}

test("the owner may write without the store being consulted", async () => {
  const access = store(false);

  assert.strictEqual(await mayWrite(repo, ownerId, access), true);
  assert.deepStrictEqual(access.asked, [], "an owner push cost a query");
});

test("an admin who is not the owner may write, on one question", async () => {
  const access = store(true);

  assert.strictEqual(await mayWrite(repo, otherId, access), true);
  assert.strictEqual(
    access.asked.length,
    1,
    "a non-owner check is exactly one question",
  );
});

test("a grant is checked against the repo being written to", async () => {
  const access = store(true);

  assert.strictEqual(await mayWrite(repo, otherId, access), true);
  assert.deepStrictEqual(access.asked, [{ userId: otherId, repoId }]);
});

test("a user with neither admin nor a grant is refused, not thrown at", async () => {
  const access = store(false);

  assert.strictEqual(await mayWrite(repo, otherId, access), false);
  assert.strictEqual(access.asked.length, 1);
});

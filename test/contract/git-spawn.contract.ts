// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  type GitChild,
  gitConcurrency,
  runGit,
  spawnGit,
} from "../../src/git/spawn.js";

const cwd = tmpdir();
const generous = 30_000;
const impatient = 200;
const bounded = { timeout: 10_000 };

async function blocker(timeoutMs: number): Promise<GitChild> {
  const child = await spawnGit({
    args: ["hash-object", "--stdin"],
    cwd,
    timeoutMs,
  });

  child.stdout.resume();
  child.stderr.resume();

  return child;
}

async function release(child: GitChild): Promise<void> {
  child.stdin.end();
  await child.done;
}

test("a git call inside the timeout is untouched", bounded, async () => {
  const child = await spawnGit({
    args: ["--version"],
    cwd,
    timeoutMs: generous,
  });

  child.stdout.resume();
  child.stderr.resume();

  assert.deepStrictEqual(await child.done, { code: 0, outcome: "exited" });
});

test("a git call past the timeout is killed and says so", bounded, async () => {
  const result = await (await blocker(impatient)).done;

  assert.strictEqual(result.outcome, "timed-out");
  assert.strictEqual(result.code, null);

  await assert.rejects(
    runGit({ args: ["hash-object", "--stdin"], cwd, timeoutMs: impatient }),
    /timed out after 200ms/,
  );
});

test(
  "the concurrency cap queues the next call until a slot frees",
  bounded,
  async () => {
    const running: GitChild[] = [];

    for (let i = 0; i < gitConcurrency; i += 1) {
      running.push(await blocker(generous));
    }

    let spawned = false;
    const queued = blocker(generous).then((child) => {
      spawned = true;

      return child;
    });

    await delay(250);
    assert.strictEqual(spawned, false, "the cap did not queue the next call");

    const first = running.shift();
    assert.ok(first);
    await release(first);

    running.push(await queued);
    assert.strictEqual(spawned, true);

    for (const child of running) {
      await release(child);
    }
  },
);

test(
  "a synchronous spawn failure hands its slot to the queue",
  bounded,
  async () => {
    const running: GitChild[] = [];

    for (let i = 0; i < gitConcurrency; i += 1) {
      running.push(await blocker(generous));
    }

    const failing = assert.rejects(
      spawnGit({
        args: ["--version"],
        cwd,
        gitProtocol: "version=2\0",
        timeoutMs: generous,
      }),
      { code: "ERR_INVALID_ARG_VALUE" },
    );

    let spawned = false;
    const queued = blocker(generous).then((child) => {
      spawned = true;

      return child;
    });

    const first = running.shift();
    assert.ok(first);
    await release(first);
    await failing;

    await delay(250);
    assert.strictEqual(spawned, true, "the failed spawn leaked its slot");

    running.push(await queued);

    for (const child of running) {
      await release(child);
    }
  },
);

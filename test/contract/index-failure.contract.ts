// SPDX-License-Identifier: AGPL-3.0-or-later

// config reads the environment once at import, so the only way to drive a
// dead database is a child process that starts with a dead one

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

function ts(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw({ raw: strings }, ...values);
}

const root = resolve(import.meta.dirname, "../../..");
const nowhere = "postgresql://nobody:nobody@127.0.0.1:1/nothing";

// the app logs to stdout, and pino's writes can land after console.log
const sentinel = "carn-probe:";

const probe = ts`
const { buildApp } = await import("./dist/src/app.js");
const { listRepos } = await import("./dist/src/repos/list.js");
const Fastify = (await import("fastify")).default;

const app = buildApp();
const guarded = await app.inject({ method: "GET", url: "/" });
await app.close();

const bare = Fastify({ logger: false });
bare.get("/bare", async () => await listRepos());
const unguarded = await bare.inject({ method: "GET", url: "/bare" });
await bare.close();

console.log("${sentinel}" + JSON.stringify({
  guarded: { status: guarded.statusCode, body: guarded.body },
  unguarded: { status: unguarded.statusCode, body: unguarded.body },
}));
process.exit(0);
`;

test("a dead database does not put the driver's message on a public page", () => {
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", probe],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: nowhere, LOG_LEVEL: "silent" },
    },
  );

  const line = output.split("\n").find((row) => row.startsWith(sentinel));
  assert.ok(line, `the probe printed no result:\n${output}`);
  const { guarded, unguarded } = JSON.parse(line.slice(sentinel.length));

  assert.strictEqual(guarded.status, 503);
  assert.match(guarded.body, /<h1 class="t-l">Unavailable<\/h1>/);
  assert.match(guarded.body, /The page failed to load on the server\./);
  assert.match(guarded.body, /Try again shortly\./);

  assert.match(
    unguarded.body,
    /127\.0\.0\.1:1/,
    "an unguarded handler no longer echoes the unreachable host, so the guard on / is measuring nothing",
  );
  assert.doesNotMatch(guarded.body, /127\.0\.0\.1|prisma|queryRaw/i);
});

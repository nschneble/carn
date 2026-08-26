// SPDX-License-Identifier: AGPL-3.0-or-later

// every case below refuses before resolveRepo runs, so none reaches the
// database; the stub only has to clear config.ts's fail-fast

import assert from "node:assert";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused/unused";

const { buildApp } = await import("../../src/app.js");
const { refusals } = await import("../../src/routes/git-http.js");

const noCache = {
  "cache-control": "no-cache, max-age=0, must-revalidate",
  expires: "Fri, 01 Jan 1980 00:00:00 GMT",
  pragma: "no-cache",
};

async function inject(options: {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  payload?: string;
}) {
  const app = buildApp();
  const response = await app.inject(options);
  await app.close();
  return response;
}

function assertRefusal(
  response: {
    statusCode: number;
    headers: Record<string, unknown>;
    body: string;
  },
  status: number,
  message: string,
): void {
  assert.strictEqual(response.statusCode, status);
  assert.strictEqual(response.body, `${message}\n`);
  assert.ok(
    String(response.headers["content-type"]).startsWith("text/plain"),
    `refused as ${String(response.headers["content-type"])}`,
  );

  for (const [name, value] of Object.entries(noCache)) {
    assert.strictEqual(response.headers[name], value, `${name} was wrong`);
  }
}

test("the advertisement refuses receive-pack and names SSH", async () => {
  const response = await inject({
    method: "GET",
    url: "/r/demo/info/refs?service=git-receive-pack",
  });

  assertRefusal(response, 403, refusals.noHttpPush);
  assert.match(response.body, /SSH/);
});

// a stock git push stops at the GET above, so nothing else reaches this
test("the receive-pack POST refuses and names SSH", async () => {
  const response = await inject({
    method: "POST",
    url: "/r/demo/git-receive-pack",
    headers: { "content-type": "application/x-git-receive-pack-request" },
    payload: "0000",
  });

  assertRefusal(response, 403, refusals.noHttpPush);
  assert.match(response.body, /SSH/);
});

test("the advertisement refuses a missing or unknown service", async () => {
  for (const url of [
    "/r/demo/info/refs",
    "/r/demo/info/refs?service=",
    "/r/demo/info/refs?service=git-archive",
    "/r/demo/info/refs?service=git-upload-archive",
    "/r/demo/info/refs?service=GIT-UPLOAD-PACK",
  ]) {
    const response = await inject({ method: "GET", url });
    assertRefusal(response, 400, refusals.smartOnly);
  }
});

test("upload-pack refuses a body that is not a git request", async () => {
  for (const [type, payload] of [
    ["application/json", '{"want":"refs/heads/main"}'],
    ["text/plain", "0000"],
  ] as const) {
    const response = await inject({
      method: "POST",
      url: "/r/demo/git-upload-pack",
      headers: { "content-type": type },
      payload,
    });

    assertRefusal(response, 415, refusals.smartOnly);
  }
});

test("the refusals explain what happened and what to do", () => {
  const lines = [
    refusals.badName,
    refusals.noRepo("demo"),
    refusals.noHttpPush,
    refusals.smartOnly,
    refusals.unavailable,
  ];

  for (const line of lines) {
    assert.doesNotMatch(line, /[!]|\.\.\.|sorry|oops|apolog/i, line);
    assert.strictEqual(line.includes("\n"), false, `${line} spans lines`);
  }

  assert.match(refusals.noRepo("demo"), /no repo named demo/);
  assert.match(refusals.noHttpPush, /git@<host>:<repo>/);
});

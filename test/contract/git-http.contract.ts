// SPDX-License-Identifier: AGPL-3.0-or-later

// every case below refuses before resolveRepo runs, so none reaches the
// database; the stub only has to clear config.ts's fail-fast

import assert from "node:assert";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused/unused";

const { buildApp } = await import("../../src/app.js");
const { refusals } = await import("../../src/routes/git-http.js");
const { config } = await import("../../src/config.js");

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

// the Host header is attacker-controlled on an anonymous route, so the
// refusal must use the configured host, never reflect what the client sent
test("the advertisement refuses receive-pack, names SSH, and uses the configured host", async () => {
  const response = await inject({
    method: "GET",
    url: "/r/demo/info/refs?service=git-receive-pack",
    headers: { host: "spoofed.invalid" },
  });

  assertRefusal(response, 403, refusals.noHttpPush(config.host, "demo"));
  assert.match(response.body, /SSH/);
  assert.match(response.body, new RegExp(`git@${config.host}:demo`));
  assert.doesNotMatch(response.body, /spoofed\.invalid/);
});

// a stock git push stops at the GET above, so nothing else reaches this
test("the receive-pack POST refuses, names SSH, and uses the configured host", async () => {
  const response = await inject({
    method: "POST",
    url: "/r/demo/git-receive-pack",
    headers: {
      host: "spoofed.invalid",
      "content-type": "application/x-git-receive-pack-request",
    },
    payload: "0000",
  });

  assertRefusal(response, 403, refusals.noHttpPush(config.host, "demo"));
  assert.match(response.body, /SSH/);
  assert.match(response.body, new RegExp(`git@${config.host}:demo`));
  assert.doesNotMatch(response.body, /spoofed\.invalid/);
});

// noHttpPush runs before resolveRepo, so an invalid name reaches it raw;
// git prints the refusal body to the pusher's own terminal via
// show_http_message(), so a name carrying an escape sequence must never
// survive into that body
test("noHttpPush drops a repo name that fails validation rather than reflect it", async () => {
  const hostile = "demo\x1b[31mPWNED\x1b[0m";

  const getResponse = await inject({
    method: "GET",
    url: `/r/${encodeURIComponent(hostile)}/info/refs?service=git-receive-pack`,
  });
  assertRefusal(getResponse, 403, refusals.noHttpPush(config.host, null));
  assert.strictEqual(
    getResponse.body.includes("\x1b"),
    false,
    getResponse.body,
  );
  assert.match(getResponse.body, /SSH/);

  const postResponse = await inject({
    method: "POST",
    url: `/r/${encodeURIComponent(hostile)}/git-receive-pack`,
    headers: { "content-type": "application/x-git-receive-pack-request" },
    payload: "0000",
  });
  assertRefusal(postResponse, 403, refusals.noHttpPush(config.host, null));
  assert.strictEqual(
    postResponse.body.includes("\x1b"),
    false,
    postResponse.body,
  );
  assert.match(postResponse.body, /SSH/);
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

    assertRefusal(response, 415, refusals.wrongBody);
  }
});

test("the refusals explain what happened and what to do", () => {
  const lines = [
    refusals.badName,
    refusals.noRepo("demo"),
    refusals.noHttpPush(config.host, "demo"),
    refusals.noHttpPush(config.host, null),
    refusals.smartOnly,
    refusals.wrongBody,
    refusals.unavailable,
  ];

  for (const line of lines) {
    assert.doesNotMatch(line, /[!]|\.\.\.|sorry|oops|apolog/i, line);
    assert.strictEqual(line.includes("\n"), false, `${line} spans lines`);
  }

  assert.match(refusals.noRepo("demo"), /no repo named demo/);
  assert.match(
    refusals.noHttpPush(config.host, "demo"),
    new RegExp(`git@${config.host}:demo`),
  );
  assert.match(
    refusals.noHttpPush(config.host, null),
    new RegExp(`git@${config.host} `),
  );
  assert.match(refusals.wrongBody, /git-upload-pack/);
});

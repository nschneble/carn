// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import Fastify from "fastify";

import { buildApp } from "../../src/app.js";
import { sendPage } from "../../src/routes/cache.js";

const securityHeaders = {
  "content-security-policy":
    "default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

test("health reports the process is up, as json", async () => {
  const app = buildApp();
  const response = await app.inject({ method: "GET", url: "/health" });
  await app.close();

  assert.strictEqual(response.statusCode, 200);
  assert.ok(
    String(response.headers["content-type"]).startsWith("application/json"),
  );
  assert.strictEqual(response.body, '{"status":"ok"}');
});

test("a read page revalidates on its own bytes and varies on the cookie", async () => {
  const app = Fastify();
  app.get<{ Querystring: { theme?: string } }>("/page", (request, reply) =>
    sendPage(request, reply, `<p>${request.query.theme ?? "unstamped"}</p>`),
  );

  const dark = await app.inject({ method: "GET", url: "/page?theme=dark" });
  const light = await app.inject({ method: "GET", url: "/page?theme=light" });
  const again = await app.inject({
    method: "GET",
    url: "/page?theme=dark",
    headers: { "if-none-match": String(dark.headers.etag) },
  });
  const crossed = await app.inject({
    method: "GET",
    url: "/page?theme=light",
    headers: { "if-none-match": String(dark.headers.etag) },
  });
  await app.close();

  assert.strictEqual(dark.headers["cache-control"], "public, no-cache");
  assert.strictEqual(dark.headers.vary, "Cookie");
  assert.match(String(dark.headers.etag), /^"[0-9a-f]{16}"$/);
  assert.match(String(dark.headers["content-type"]), /^text\/html/);

  assert.notStrictEqual(
    dark.headers.etag,
    light.headers.etag,
    "two themes of the same page share an etag, so a cache would hand one reader the other's theme",
  );

  assert.strictEqual(again.statusCode, 304);
  assert.strictEqual(again.body, "");
  assert.strictEqual(
    crossed.statusCode,
    200,
    "a stale validator was answered 304, so the body never reaches the reader whose theme changed",
  );
  assert.strictEqual(crossed.body, "<p>light</p>");
});

test("the security headers reach a hit and a miss alike", async () => {
  const app = buildApp();
  const hit = await app.inject({ method: "GET", url: "/health" });
  const miss = await app.inject({ method: "GET", url: "/not-a-route" });
  await app.close();

  assert.strictEqual(hit.statusCode, 200);
  assert.strictEqual(miss.statusCode, 404);

  for (const [name, value] of Object.entries(securityHeaders)) {
    assert.strictEqual(hit.headers[name], value);
    assert.strictEqual(miss.headers[name], value);
  }
});

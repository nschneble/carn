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

// nothing about a reader reaches the render, so a shared cache holds one
// entry per URL
test("a read page revalidates on its own bytes and varies on nothing", async () => {
  const app = Fastify();
  app.get<{ Querystring: { body?: string } }>("/page", (request, reply) =>
    sendPage(request, reply, `<p>${request.query.body ?? "first"}</p>`),
  );

  const first = await app.inject({ method: "GET", url: "/page" });
  const edited = await app.inject({ method: "GET", url: "/page?body=second" });
  const again = await app.inject({
    method: "GET",
    url: "/page",
    headers: { "if-none-match": String(first.headers.etag) },
  });
  const crossed = await app.inject({
    method: "GET",
    url: "/page?body=second",
    headers: { "if-none-match": String(first.headers.etag) },
  });
  const cookied = await app.inject({
    method: "GET",
    url: "/page",
    headers: { cookie: "theme=light" },
  });
  await app.close();

  assert.strictEqual(first.headers["cache-control"], "public, no-cache");
  assert.strictEqual(first.headers.vary, undefined);
  assert.match(String(first.headers.etag), /^"[0-9a-f]{16}"$/);
  assert.match(String(first.headers["content-type"]), /^text\/html/);

  assert.notStrictEqual(
    first.headers.etag,
    edited.headers.etag,
    "two different bodies share an etag, so a cache would hand a reader the wrong one",
  );

  assert.strictEqual(again.statusCode, 304);
  assert.strictEqual(again.body, "");
  assert.strictEqual(
    crossed.statusCode,
    200,
    "a stale validator was answered 304, so the edited body never reaches the reader",
  );
  assert.strictEqual(crossed.body, "<p>second</p>");

  assert.strictEqual(
    cookied.body,
    first.body,
    "a cookie changed the response, so something about the reader still reaches the render and dropping Vary was wrong",
  );
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

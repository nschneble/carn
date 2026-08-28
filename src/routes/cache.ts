// SPDX-License-Identifier: AGPL-3.0-or-later

// a read page is public and identical for everyone reading it under the
// same theme, so it revalidates against its own bytes rather than expire
// the theme lives in a cookie, which is what Vary is declaring

import { createHash } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

const htmlType = "text/html; charset=utf-8";
const revalidate = "public, no-cache";

function etag(body: string): string {
  return `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
}

// stamps the theme-varying headers every rendered body needs, error
// pages included, and reports whether the client already has this body
function stamp(
  request: FastifyRequest,
  reply: FastifyReply,
  body: string,
): boolean {
  const tag = etag(body);

  reply
    .header("Cache-Control", revalidate)
    .header("Vary", "Cookie")
    .header("ETag", tag);

  return request.headers["if-none-match"] === tag;
}

export function sendPage(
  request: FastifyRequest,
  reply: FastifyReply,
  body: string,
): FastifyReply {
  if (stamp(request, reply, body)) return reply.code(304).send();

  return reply.type(htmlType).send(body);
}

// for a non-200 body (a 404 or a transient 503) that still carries the
// theme, so a shared cache can't hand one reader another's theme
export function sendStatus(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  body: string,
): FastifyReply {
  if (stamp(request, reply, body)) return reply.code(304).send();

  return reply.code(status).type(htmlType).send(body);
}

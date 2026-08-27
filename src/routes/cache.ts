// SPDX-License-Identifier: AGPL-3.0-or-later

// a read page is public and identical for everyone reading it under the
// same theme, so it revalidates against its own bytes rather than expiring.
// the theme lives in a cookie, which is what Vary is declaring

import { createHash } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

const htmlType = "text/html; charset=utf-8";
const revalidate = "public, no-cache";

function etag(body: string): string {
  return `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
}

export function sendPage(
  request: FastifyRequest,
  reply: FastifyReply,
  body: string,
): FastifyReply {
  const tag = etag(body);

  reply
    .header("Cache-Control", revalidate)
    .header("Vary", "Cookie")
    .header("ETag", tag);

  if (request.headers["if-none-match"] === tag) {
    return reply.code(304).send();
  }

  return reply.type(htmlType).send(body);
}

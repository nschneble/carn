// SPDX-License-Identifier: AGPL-3.0-or-later

// style-src 'self' drops an inline <style> block and a style attribute
// alike, so the stylesheet is only ever a route. its URL carries a hash
// of its own bytes, which is what makes immutable true

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { FastifyInstance } from "fastify";

import { styleHref, stylesheet } from "../html/styles.js";

const root = resolve(import.meta.dirname, "../../..");
const faceNames = [
  "carn-sans.woff2",
  "carn-mono-400.woff2",
  "carn-mono-500.woff2",
];

const forever = "public, max-age=31536000, immutable";
const week = "public, max-age=604800";

function etag(body: Buffer | string): string {
  return `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
}

const faces = new Map(
  faceNames.map((name) => {
    const body = readFileSync(join(root, "fonts", name));
    return [name, { body, etag: etag(body) }];
  }),
);

export function assetRoutes(app: FastifyInstance): void {
  app.get(styleHref, (_request, reply) => {
    reply
      .header("Cache-Control", forever)
      .type("text/css; charset=utf-8")
      .send(stylesheet);
  });

  app.get<{ Params: { face: string } }>("/fonts/:face", (request, reply) => {
    const face = faces.get(request.params.face);

    if (face === undefined) {
      reply.code(404).type("text/plain").send("No such font.\n");
      return;
    }

    reply.header("Cache-Control", week).header("ETag", face.etag);

    if (request.headers["if-none-match"] === face.etag) {
      reply.code(304).send();
      return;
    }

    reply.type("font/woff2").send(face.body);
  });
}

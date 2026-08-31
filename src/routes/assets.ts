// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { FastifyInstance } from "fastify";

import { styleHref } from "../html/styles.js";
import { servedStylesheet } from "../html/wire-weight.js";

const root = resolve(import.meta.dirname, "../../..");

const faceTypes: Record<string, string> = {
  "carn-mono-400.woff2": "font/woff2",
  "carn-mono-500.woff2": "font/woff2",
  "carn-sans.woff2": "font/woff2",
};
const imageTypes: Record<string, string> = {
  "apple-touch-icon.png": "image/png",
  "favicon.ico": "image/x-icon",
  "favicon.png": "image/png",
  "preview.jpg": "image/jpeg",
};

const forever = "public, max-age=31536000, immutable";
const week = "public, max-age=604800";

function etag(body: Buffer | string): string {
  return `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
}

const faces = new Map(
  Object.entries(faceTypes).map(([name, type]) => {
    const body = readFileSync(join(root, "fonts", name));
    return [name, { body, etag: etag(body), type }];
  }),
);

const images = new Map(
  Object.entries(imageTypes).map(([name, type]) => {
    const body = readFileSync(join(root, "images", name));
    return [name, { body, etag: etag(body), type }];
  }),
);

export function assetRoutes(app: FastifyInstance): void {
  app.get(styleHref, (_request, reply) => {
    reply
      .header("Cache-Control", forever)
      .type("text/css; charset=utf-8")
      .send(servedStylesheet);
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

    reply.type(face.type).send(face.body);
  });

  app.get<{ Params: { image: string } }>("/images/:image", (request, reply) => {
    const image = images.get(request.params.image);
    if (image === undefined) {
      reply.code(404).type("text/plain").send("No such image.\n");
      return;
    }

    reply.header("Cache-Control", week).header("ETag", image.etag);

    if (request.headers["if-none-match"] === image.etag) {
      reply.code(304).send();
      return;
    }

    reply.type(image.type).send(image.body);
  });
}

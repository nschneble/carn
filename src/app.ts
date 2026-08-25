// SPDX-License-Identifier: AGPL-3.0-or-later

import Fastify, { type FastifyInstance } from "fastify";

import { healthRoute } from "./routes/health.js";

const contentSecurityPolicy =
  "default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Content-Security-Policy", contentSecurityPolicy);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });

  healthRoute(app);

  return app;
}

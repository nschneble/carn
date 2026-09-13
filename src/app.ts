// SPDX-License-Identifier: AGPL-3.0-or-later

import Fastify, { type FastifyInstance } from "fastify";

import { errorPage, noSuchRoute } from "./html/error-page.js";
import { assetRoutes } from "./routes/assets.js";
import { sendStatus } from "./routes/cache.js";
import { gitHttpRoutes } from "./routes/git-http.js";
import { healthRoute } from "./routes/health.js";
import { indexRoute } from "./routes/index-page.js";
import { repoPageRoutes } from "./routes/repo-page.js";

export const contentSecurityPolicy =
  "base-uri 'none'; " +
  "default-src 'none'; " +
  "font-src 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'; " +
  "img-src 'self' data:; " +
  "style-src 'self';";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Content-Security-Policy", contentSecurityPolicy);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });

  assetRoutes(app);
  gitHttpRoutes(app);
  healthRoute(app);
  indexRoute(app);
  repoPageRoutes(app);

  // git http's 404s are matched routes; only unmatched paths reach here
  app.setNotFoundHandler((request, reply) =>
    sendStatus(request, reply, 404, errorPage({ failure: noSuchRoute })),
  );

  return app;
}

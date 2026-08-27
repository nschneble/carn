// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";

import { now } from "../clock.js";
import { repoListPage } from "../html/repo-list.js";
import { readTheme } from "../html/theme.js";
import { listRepos } from "../repos/list.js";
import { sendPage } from "./cache.js";

// fastify's default body carries the driver's message, host and all
const unavailable = "The repo list is unavailable. Try again shortly.\n";

export function indexRoute(app: FastifyInstance): void {
  app.get("/", async (request, reply) => {
    try {
      const repos = await listRepos();

      return await sendPage(
        request,
        reply,
        repoListPage({
          repos,
          theme: readTheme(request.headers.cookie),
          now: now(),
        }),
      );
    } catch (error) {
      request.log.error({ err: error }, "index: the repo list failed to load");
      return await reply
        .code(503)
        .type("text/plain; charset=utf-8")
        .send(unavailable);
    }
  });
}

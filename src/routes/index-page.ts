// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";

import { now } from "../clock.js";
import { errorPage, unavailable } from "../html/error-page.js";
import { repoListPage } from "../html/repo-list.js";
import { listRepos } from "../repos/list.js";
import { sendPage, sendStatus } from "./cache.js";

export function indexRoute(app: FastifyInstance): void {
  app.get("/", async (request, reply) => {
    try {
      const repos = await listRepos();

      return await sendPage(
        request,
        reply,
        repoListPage({ repos, now: now() }),
      );
    } catch (error) {
      request.log.error({ err: error }, "index: the repo list failed to load");
      return await sendStatus(
        request,
        reply,
        503,
        errorPage({ failure: unavailable }),
      );
    }
  });
}

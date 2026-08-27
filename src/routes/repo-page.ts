// SPDX-License-Identifier: AGPL-3.0-or-later

// a committed header is served first-party because img-src is 'self'
// data:. the app's own default-src 'none' already denies script to a
// navigated svg, which is the control PLAN.md 04 asks the blob origin for

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { readBlob } from "../git/blob.js";
import {
  badRepoName,
  errorPage,
  type Failure,
  noSuchRepo,
  unavailable,
} from "../html/error-page.js";
import { repoShowPage } from "../html/repo-show.js";
import { readTheme, type Theme } from "../html/theme.js";
import { type Header, maxHeaderBytes, resolveHeader } from "../repos/header.js";
import {
  type HeaderAsset,
  headerExtension,
  headerTypes,
  parseHeaderAsset,
} from "../repos/header-asset.js";
import { resolveRepo } from "../repos/resolve.js";
import { loadRepoView } from "../repos/show.js";
import { resolveTip } from "../repos/tree.js";

type PageRoute = { Params: { repo: string }; Querystring: { all?: string } };
type AssetRoute = { Params: { repo: string; asset: string } };

const forever = "public, max-age=31536000, immutable";
const noImage = "No such header image.\n";
const imageFailed = "That header image failed to load. Try again shortly.\n";
const htmlType = "text/html; charset=utf-8";

// the child dies with the response, never with the request body
function abortWith(reply: FastifyReply): AbortSignal {
  const abandoned = new AbortController();

  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) abandoned.abort();
  });

  return abandoned.signal;
}

function fail(
  reply: FastifyReply,
  status: number,
  failure: Failure,
  theme: Theme | null,
): FastifyReply {
  return reply.code(status).type(htmlType).send(errorPage({ failure, theme }));
}

async function showRepo(
  request: FastifyRequest<PageRoute>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const theme = readTheme(request.headers.cookie);

  try {
    const found = await resolveRepo(request.params.repo);

    if (found.status !== "found") {
      const failure =
        found.status === "invalid" ? badRepoName : noSuchRepo(found.name);

      return fail(reply, 404, failure, theme);
    }

    const repo = await loadRepoView({
      repo: found.repo,
      signal: abortWith(reply),
    });

    return reply
      .type(htmlType)
      .send(repoShowPage({ repo, theme, showAll: request.query.all === "1" }));
  } catch (error) {
    request.log.error({ err: error }, "repo page: the page failed to render");
    return fail(reply, 503, unavailable, theme);
  }
}

function committed(header: Header, asset: HeaderAsset): boolean {
  return [header.light, header.dark].some(
    (source) =>
      source !== "wordmark" &&
      source.oid === asset.oid &&
      headerExtension(source.path) === asset.extension,
  );
}

async function serveHeader(
  request: FastifyRequest<AssetRoute>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const missing = () =>
    reply.code(404).type("text/plain; charset=utf-8").send(noImage);

  try {
    const asset = parseHeaderAsset(request.params.asset);
    if (asset === null) return missing();

    const found = await resolveRepo(request.params.repo);
    if (found.status !== "found") return missing();

    const signal = abortWith(reply);
    const commit = await resolveTip({
      repoPath: found.repo.path,
      branch: found.repo.defaultBranch,
      signal,
    });

    const header = await resolveHeader({
      repoPath: found.repo.path,
      commit,
      signal,
    });

    if (!committed(header, asset)) return missing();

    const body = await readBlob({
      repoPath: found.repo.path,
      oid: asset.oid,
      limit: maxHeaderBytes,
      signal,
    });

    return reply
      .header("Cache-Control", forever)
      .type(headerTypes[asset.extension])
      .send(body);
  } catch (error) {
    request.log.error({ err: error }, "repo page: the header failed to load");
    return reply.code(503).type("text/plain; charset=utf-8").send(imageFailed);
  }
}

export function repoPageRoutes(app: FastifyInstance): void {
  app.get<AssetRoute>("/r/:repo/header/:asset", serveHeader);
  app.get<PageRoute>("/r/:repo", showRepo);
}

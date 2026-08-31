// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { now } from "../clock.js";
import { config } from "../config.js";
import { readBlob } from "../git/blob.js";
import { blobPage } from "../html/blob-page.js";
import { commitLogPage } from "../html/commit-log.js";
import {
  badRepoName,
  errorPage,
  type Failure,
  noSuchFile,
  noSuchRef,
  noSuchRepo,
  unavailable,
} from "../html/error-page.js";
import { repoShowPage } from "../html/repo-show.js";
import { assetRoomBytes } from "../html/wire-weight.js";
import { parseBlobAsset, sniffRaster } from "../repos/blob-asset.js";
import { loadBlobView } from "../repos/blob-view.js";
import { type Header, maxHeaderBytes, resolveHeader } from "../repos/header.js";
import {
  type HeaderAsset,
  headerType,
  parseHeaderAsset,
} from "../repos/header-asset.js";
import { loadCommitLog } from "../repos/log.js";
import { resolveRepo } from "../repos/resolve.js";
import { loadRepoView } from "../repos/show.js";
import { resolveTip } from "../repos/tree.js";
import { sendPage, sendStatus } from "./cache.js";

type PageRoute = { Params: { repo: string }; Querystring: { all?: string } };
type AssetRoute = { Params: { repo: string; asset: string } };
type BlobRoute = { Params: { repo: string; rev: string; "*": string } };
type LogRoute = {
  Params: { repo: string };
  Querystring: { ref?: string | string[]; from?: string | string[] };
};

const forever = "public, max-age=31536000, immutable";
const noImage = "No such header image.\n";
const imageFailed = "The header image failed to load. Try again shortly.\n";
const noAsset = "No such image.\n";
const assetFailed = "The image failed to load. Try again shortly.\n";

// the child dies with the response, never with the request body
function abortWith(reply: FastifyReply): AbortSignal {
  const abandoned = new AbortController();

  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) abandoned.abort();
  });

  return abandoned.signal;
}

function fail(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  failure: Failure,
): FastifyReply {
  return sendStatus(request, reply, status, errorPage({ failure }));
}

async function showRepo(
  request: FastifyRequest<PageRoute>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  try {
    const found = await resolveRepo(request.params.repo);
    if (found.status !== "found") {
      const failure =
        found.status === "invalid" ? badRepoName : noSuchRepo(found.name);
      return fail(request, reply, 404, failure);
    }

    const repo = await loadRepoView({
      repo: found.repo,
      signal: abortWith(reply),
    });

    return sendPage(
      request,
      reply,
      repoShowPage({ repo, showAll: request.query.all === "1" }),
    );
  } catch (error) {
    request.log.error({ err: error }, "repo page: the page failed to render");
    return fail(request, reply, 503, unavailable);
  }
}

function committed(header: Header, asset: HeaderAsset): boolean {
  return [header.light, header.dark].some(
    (source) => source !== "wordmark" && source.oid === asset.oid,
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

    return reply.header("Cache-Control", forever).type(headerType).send(body);
  } catch (error) {
    request.log.error({ err: error }, "repo page: the header failed to load");
    return reply.code(503).type("text/plain; charset=utf-8").send(imageFailed);
  }
}

async function showBlob(
  request: FastifyRequest<BlobRoute>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const path = request.params["*"];

  try {
    const found = await resolveRepo(request.params.repo);
    if (found.status !== "found") {
      const failure =
        found.status === "invalid" ? badRepoName : noSuchRepo(found.name);
      return fail(request, reply, 404, failure);
    }

    const blob = await loadBlobView({
      repoPath: found.repo.path,
      rev: request.params.rev,
      path,
      signal: abortWith(reply),
    });

    if (blob === null) return fail(request, reply, 404, noSuchFile(path));

    return sendPage(
      request,
      reply,
      blobPage({
        repo: found.repo.name,
        blob,
        rawOrigin: config.rawOrigin,
      }),
    );
  } catch (error) {
    request.log.error({ err: error }, "repo page: the blob failed to render");
    return fail(request, reply, 503, unavailable);
  }
}

// a ref the caller named and git cannot resolve is a 404, never a quiet
// fall back to the default branch; only the unasked-for default is allowed
// to come back empty, which is a repo with nothing pushed to it yet
async function showCommits(
  request: FastifyRequest<LogRoute>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const asked = request.query.ref;
  const from = request.query.from ?? null;

  // a repeated query key parses to an array, so the pair is only the two
  // strings the loader is typed for once the array case is refused here
  if (Array.isArray(asked) || Array.isArray(from)) {
    return fail(request, reply, 404, noSuchRef(String(asked ?? from)));
  }

  try {
    const found = await resolveRepo(request.params.repo);
    if (found.status !== "found") {
      const failure =
        found.status === "invalid" ? badRepoName : noSuchRepo(found.name);
      return fail(request, reply, 404, failure);
    }

    const ref = asked ?? found.repo.defaultBranch;
    const log = await loadCommitLog({
      repoPath: found.repo.path,
      ref,
      from,
      signal: abortWith(reply),
    });

    if (log === null && (asked !== undefined || from !== null)) {
      return fail(request, reply, 404, noSuchRef(from ?? ref));
    }

    return sendPage(
      request,
      reply,
      commitLogPage({
        repo: found.repo.name,
        log: log ?? { ref, commits: [], next: null },
        now: now(),
        from,
      }),
    );
  } catch (error) {
    request.log.error({ err: error }, "repo page: the log failed to render");
    return fail(request, reply, 503, unavailable);
  }
}

// the oid is the whole address, so the response is immutable. the guard is
// that cat-file refuses anything that is not a blob of this repo, the read
// is capped, and the bytes have to actually be the raster the url claims
async function serveBlobAsset(
  request: FastifyRequest<AssetRoute>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const missing = () =>
    reply.code(404).type("text/plain; charset=utf-8").send(noAsset);

  try {
    const asset = parseBlobAsset(request.params.asset);
    if (asset === null) return missing();

    const found = await resolveRepo(request.params.repo);
    if (found.status !== "found") return missing();

    const body = await readBlob({
      repoPath: found.repo.path,
      oid: asset.oid,
      limit: assetRoomBytes + 1,
      signal: abortWith(reply),
    }).catch(() => null);

    if (body === null || body.length > assetRoomBytes) return missing();
    if (sniffRaster(body)?.type !== asset.format.type) return missing();

    return reply
      .header("Cache-Control", forever)
      .type(asset.format.type)
      .send(body);
  } catch (error) {
    request.log.error({ err: error }, "repo page: the blob asset failed");
    return reply.code(503).type("text/plain; charset=utf-8").send(assetFailed);
  }
}

export function repoPageRoutes(app: FastifyInstance): void {
  app.get<AssetRoute>("/r/:repo/header/:asset", serveHeader);
  app.get<AssetRoute>("/r/:repo/blob-asset/:asset", serveBlobAsset);
  app.get<BlobRoute>("/r/:repo/blob/:rev/*", showBlob);
  app.get<LogRoute>("/r/:repo/commits", showCommits);
  app.get<PageRoute>("/r/:repo", showRepo);
}

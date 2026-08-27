// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Refusals answer as text/plain because git's show_http_message()
// drops a server message sent as any other type

import { PassThrough, pipeline, Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../config.js";
import { spawnGit } from "../git/spawn.js";
import {
  namePattern,
  type ResolvedRepo,
  resolveRepo,
} from "../repos/resolve.js";

const timeoutMs = 600_000;

// only here so a pathological child cannot grow the heap
const stderrBudget = 8192;

const requestTypes = [
  "application/x-git-upload-pack-request",
  "application/x-git-receive-pack-request",
];

const serviceHeader = Buffer.from("001e# service=git-upload-pack\n0000");

export const refusals = {
  badName: "That's not a valid repo name. Check the URL and try again.",
  noRepo: (name: string) =>
    `There's no repo named ${name}. Push to it over SSH to create it.`,
  noHttpPush: (host: string, repo: string | null) =>
    "This server takes pushes over SSH, not HTTP. " +
    (repo === null
      ? `Set your remote to git@${host} and push again.`
      : `Set your remote to git@${host}:${repo} and push again.`),
  smartOnly:
    "This server speaks the smart HTTP protocol only. " +
    "Clone with a git client rather than a browser.",
  wrongBody:
    "This request's body isn't a git-upload-pack request. " +
    "Use git fetch or git clone to reach this endpoint.",
  unavailable: "That request failed on the server. Try again shortly.",
};

type RepoRoute = { Params: { repo: string } };

type RefsRoute = RepoRoute & { Querystring: { service?: string } };

type Job = {
  args: string[];
  gunzip: boolean;
  prelude: Buffer | null;
  repo: ResolvedRepo;
  stdin: Readable | null;
};

function noCache(reply: FastifyReply, contentType: string): FastifyReply {
  return reply
    .header("Cache-Control", "no-cache, max-age=0, must-revalidate")
    .header("Expires", "Fri, 01 Jan 1980 00:00:00 GMT")
    .header("Pragma", "no-cache")
    .type(contentType);
}

function refuse(reply: FastifyReply, status: number, message: string): void {
  noCache(reply, "text/plain").code(status).send(`${message}\n`);
}

// noHttpPush runs before lookup(), so an unvalidated name would otherwise
// reach show_http_message() on the client's own terminal
function safeRepoName(name: string): string | null {
  return namePattern.test(name) ? name : null;
}

// git splits GIT_PROTOCOL on ":" and takes the highest version it knows
function wantsV2(gitProtocol: string | undefined): boolean {
  return gitProtocol?.split(":").includes("version=2") === true;
}

function gitProtocolOf(request: FastifyRequest): string | undefined {
  const header = request.headers["git-protocol"];
  return typeof header === "string" ? header : undefined;
}

async function lookup(
  request: FastifyRequest<RepoRoute>,
  reply: FastifyReply,
): Promise<ResolvedRepo | null> {
  const found = await resolveRepo(request.params.repo);

  if (found.status === "invalid") {
    refuse(reply, 404, refusals.badName);
    return null;
  }

  if (found.status === "missing") {
    refuse(reply, 404, refusals.noRepo(found.name));
    return null;
  }

  return found.repo;
}

async function serve(
  request: FastifyRequest,
  reply: FastifyReply,
  job: Job,
): Promise<void> {
  const abandoned = new AbortController();

  // not request.raw: its close fires when the POST body ends, mid-request
  const abort = () => {
    if (!reply.raw.writableFinished) {
      abandoned.abort();
    }
  };

  reply.raw.on("close", abort);

  const child = await spawnGit({
    args: job.args,
    cwd: job.repo.path,
    gitProtocol: gitProtocolOf(request),
    signal: abandoned.signal,
    timeoutMs,
  });

  // git exiting first makes its stdin EPIPE, which is fatal unhandled
  child.stdin.on("error", () => {});

  if (job.stdin === null) {
    child.stdin.end();
  } else {
    // pipeline, not pipe: a gunzip error with no handler ends the process
    const feed = new PassThrough();
    const stages = job.gunzip
      ? [job.stdin, createGunzip(), feed]
      : [job.stdin, feed];

    pipeline(stages, (error) => {
      if (error !== null && error !== undefined) {
        request.log.warn(
          { err: error },
          "git http: the body never reached git",
        );
        abandoned.abort();
      }
    });

    // git closing stdin is normal, so it never joins the pipeline
    feed.pipe(child.stdin);

    // git is done reading, so discard the rest instead of stalling on it
    child.stdin.on("close", () => {
      feed.resume();
    });
  }

  // an unread stderr pipe deadlocks the child once it fills
  const errors: Buffer[] = [];
  let keptBytes = 0;
  child.stderr.on("data", (chunk: Buffer) => {
    const room = stderrBudget - keptBytes;
    if (room <= 0) {
      return;
    }

    const slice = chunk.length <= room ? chunk : chunk.subarray(0, room);
    errors.push(slice);
    keptBytes += slice.length;
  });

  const body = new PassThrough();
  if (job.prelude !== null) {
    body.write(job.prelude);
  }

  child.stdout.pipe(body);
  reply.send(body);

  // throwing past this point would send a second reply over the stream
  const result = await child.done.catch((error: unknown) => {
    request.log.error({ err: error }, "git http: the child failed to run");
    return null;
  });

  reply.raw.removeListener("close", abort);

  if (result === null) {
    return;
  }

  // the response is already streaming, so this can only be said in the log
  if (result.outcome === "timed-out") {
    request.log.warn(
      { repo: job.repo.name },
      `git ${job.args[0]} was killed after ${timeoutMs}ms`,
    );
  } else if (result.outcome === "exited" && result.code !== 0) {
    request.log.error(
      {
        repo: job.repo.name,
        stderr: Buffer.concat(errors).toString("utf8").trim(),
      },
      `git ${job.args[0]} exited ${result.code}`,
    );
  }
}

// fastify's own parsers hand back a string, so the type alone won't do
function bodyStream(request: FastifyRequest<RepoRoute>): Readable | null {
  const body = request.body;
  return body instanceof Readable ? body : null;
}

async function advertise(
  request: FastifyRequest<RefsRoute>,
  reply: FastifyReply,
): Promise<void> {
  const service = request.query.service;

  if (service === "git-receive-pack") {
    refuse(
      reply,
      403,
      refusals.noHttpPush(config.host, safeRepoName(request.params.repo)),
    );
    return;
  }

  if (service !== "git-upload-pack") {
    refuse(reply, 400, refusals.smartOnly);
    return;
  }

  const repo = await lookup(request, reply);
  if (repo === null) {
    return;
  }

  noCache(reply, "application/x-git-upload-pack-advertisement");
  await serve(request, reply, {
    args: ["upload-pack", "--stateless-rpc", "--advertise-refs", "--", "."],
    gunzip: false,
    prelude: wantsV2(gitProtocolOf(request)) ? null : serviceHeader,
    repo,
    stdin: null,
  });
}

async function uploadPack(
  request: FastifyRequest<RepoRoute>,
  reply: FastifyReply,
): Promise<void> {
  const stdin = bodyStream(request);
  if (stdin === null) {
    refuse(reply, 415, refusals.wrongBody);
    return;
  }

  const repo = await lookup(request, reply);
  if (repo === null) {
    return;
  }

  noCache(reply, "application/x-git-upload-pack-result");
  await serve(request, reply, {
    args: ["upload-pack", "--stateless-rpc", "--", "."],
    gunzip: request.headers["content-encoding"] === "gzip",
    prelude: null,
    repo,
    stdin,
  });
}

function unavailable(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): void {
  // the client leaving while spawnGit is queued is routine, not a failure
  if (error instanceof Error && error.name === "AbortError") {
    request.log.warn("git http: the client left before git could start");
  } else {
    request.log.error({ err: error }, "git http: the request failed");
  }

  if (!reply.sent) {
    refuse(reply, 503, refusals.unavailable);
  }
}

export function gitHttpRoutes(app: FastifyInstance): void {
  app.addContentTypeParser(requestTypes, (_request, payload, done) => {
    done(null, payload);
  });

  // sync: an async handler double-sends an empty reply over the stream
  app.get<RefsRoute>("/r/:repo/info/refs", (request, reply) => {
    advertise(request, reply).catch((error: unknown) => {
      unavailable(request, reply, error);
    });
  });

  app.post<RepoRoute>("/r/:repo/git-upload-pack", (request, reply) => {
    uploadPack(request, reply).catch((error: unknown) => {
      unavailable(request, reply, error);
    });
  });

  app.post<RepoRoute>("/r/:repo/git-receive-pack", (request, reply) => {
    refuse(
      reply,
      403,
      refusals.noHttpPush(config.host, safeRepoName(request.params.repo)),
    );
  });
}

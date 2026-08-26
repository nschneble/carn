// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Refusals answer as text/plain because git's show_http_message()
// drops a server message sent as any other type.

import { PassThrough, pipeline, Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { spawnGit } from "../git/spawn.js";
import { type ResolvedRepo, resolveRepo } from "../repos/resolve.js";

const timeoutMs = 600_000;

const requestTypes = [
  "application/x-git-upload-pack-request",
  "application/x-git-receive-pack-request",
];

const serviceHeader = Buffer.from("001e# service=git-upload-pack\n0000");

const refusals = {
  badName: "That's not a valid repo name. Check the URL and try again.",
  noRepo: (name: string) =>
    `There's no repo named ${name}. Push to it over SSH to create it.`,
  noHttpPush:
    "This server takes pushes over SSH, not HTTP. " +
    "Set your remote to git@<host>:<repo> and push again.",
  smartOnly:
    "This server speaks the smart HTTP protocol only. " +
    "Clone with a git client rather than a browser.",
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
    const stages = job.gunzip
      ? [job.stdin, createGunzip(), child.stdin]
      : [job.stdin, child.stdin];

    pipeline(stages, (error) => {
      if (error !== null && error !== undefined) {
        request.log.warn(
          { err: error },
          "git http: the body never reached git",
        );
        abandoned.abort();
      }
    });
  }

  // an unread stderr pipe deadlocks the child once it fills
  const errors: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => {
    errors.push(chunk);
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

  if (result !== null && result.outcome === "exited" && result.code !== 0) {
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
    refuse(reply, 403, refusals.noHttpPush);
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
    refuse(reply, 415, refusals.smartOnly);
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
  request.log.error({ err: error }, "git http: the request failed");

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

  app.post("/r/:repo/git-receive-pack", (_request, reply) => {
    refuse(reply, 403, refusals.noHttpPush);
  });
}

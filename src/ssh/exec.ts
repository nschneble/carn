// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ServerChannel } from "ssh2";

import { spawnGit } from "../git/spawn.js";
import { mayWrite } from "../repos/access.js";
import { createRepo } from "../repos/create.js";
import { type ResolvedRepo, resolveRepo } from "../repos/resolve.js";

// git sq-quotes the path, escaping ' and ! which names cannot hold
const commandPattern = /^git-(receive|upload)-pack '([^']*)'$/;

const timeoutMs = 600_000;

export type GitService = "receive-pack" | "upload-pack";

export type ParsedCommand = { service: GitService; target: string };

export type ExecRequest = {
  channel: ServerChannel;
  command: string;
  gitProtocol?: string;
  userId: string;
};

// raw target isn't echoed in `badName` since it'd carry terminal escapes
export const refusals = {
  badCommand:
    "This server runs git-upload-pack and git-receive-pack only. " +
    "Use git clone or git push.",
  badName:
    "That's not a valid repo name. Names are up to 64 characters, " +
    "starting with a letter or number, and containing only letters, " +
    "numbers, dots, dashs, and underscores.",
  noRepo: (name: string) =>
    `There's no repo named ${name}. Push to it to create it.`,
  noWrite: (name: string) =>
    `You don't have write access to ${name}. Ask the owner for a grant.`,
  unavailable: "That request failed on the server. Try again shortly.",
};

export function parseCommand(command: string): ParsedCommand | null {
  const match = commandPattern.exec(command);
  if (match === null) {
    return null;
  }

  return {
    service: `${match[1]}-pack` as GitService,
    target: match[2] ?? "",
  };
}

// an abandoned channel is already gone; exiting on it throws
function finish(channel: ServerChannel, code: number): void {
  if (channel.writableEnded || channel.destroyed) {
    return;
  }

  channel.exit(code);
  channel.end();
}

export function refuse(channel: ServerChannel, message: string): void {
  if (!channel.writableEnded && !channel.destroyed) {
    channel.stderr.write(`${message}\n`);
  }

  finish(channel, 1);
}

async function resolveTarget(
  request: ExecRequest,
  parsed: ParsedCommand,
): Promise<ResolvedRepo | null> {
  const { channel, userId } = request;
  const lookup = await resolveRepo(parsed.target);

  if (lookup.status === "invalid") {
    refuse(channel, refusals.badName);
    return null;
  }

  if (lookup.status === "missing") {
    if (parsed.service === "upload-pack") {
      refuse(channel, refusals.noRepo(lookup.name));
      return null;
    }

    return createRepo(lookup.name, userId);
  }

  if (
    parsed.service === "receive-pack" &&
    !(await mayWrite(lookup.repo, userId))
  ) {
    refuse(channel, refusals.noWrite(lookup.repo.name));
    return null;
  }

  return lookup.repo;
}

async function serve(
  request: ExecRequest,
  parsed: ParsedCommand,
  repo: ResolvedRepo,
): Promise<void> {
  const { channel } = request;
  const abandoned = new AbortController();
  const abort = () => {
    abandoned.abort();
  };

  channel.on("close", abort);

  const child = await spawnGit({
    args: [parsed.service, "--", "."],
    cwd: repo.path,
    gitProtocol: request.gitProtocol,
    signal: abandoned.signal,
    timeoutMs,
  });

  // git exiting first makes its stdin EPIPE, which is fatal unhandled
  child.stdin.on("error", () => {});
  channel.pipe(child.stdin);

  // without { end: false } ssh loses the exit status and a good push fails
  child.stdout.pipe(channel, { end: false });
  child.stderr.pipe(channel.stderr, { end: false });

  const result = await child.done;
  channel.removeListener("close", abort);
  finish(channel, result.code ?? 1);
}

export async function handleExec(request: ExecRequest): Promise<void> {
  const parsed = parseCommand(request.command);
  if (parsed === null) {
    refuse(request.channel, refusals.badCommand);
    return;
  }

  const repo = await resolveTarget(request, parsed);
  if (repo === null) {
    return;
  }

  await serve(request, parsed, repo);
}

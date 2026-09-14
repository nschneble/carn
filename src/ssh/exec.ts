// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ServerChannel } from "ssh2";

import { spawnGit } from "../git/spawn.js";
import { mayAdminister, mayWrite } from "../repos/access.js";
import { createRepo } from "../repos/create.js";
import { renameRepo } from "../repos/rename.js";
import {
  namePattern,
  normalizeRepoName,
  type ResolvedRepo,
  resolveRepo,
} from "../repos/resolve.js";

// git sq-quotes the path, escaping ' and ! which names can't hold
const commandPattern = /^git-(receive|upload)-pack '([^']*)'$/;
// separately anchored: the pattern above is a security boundary
const renamePattern = /^carn repo rename (\S+) (\S+)$/;
const timeoutMs = 600_000;

export type GitService = "receive-pack" | "upload-pack";
export type ParsedCommand = { service: GitService; target: string };
export type ParsedRename = { from: string; to: string };

export type ExecRequest = {
  channel: ServerChannel;
  command: string;
  gitProtocol?: string;
  userId: string;
};

// raw target isn't echoed in `badName` since it'd carry terminal escapes
export const refusals = {
  badCommand:
    "That's not a command this server runs. It runs git-upload-pack, " +
    "git-receive-pack, and carn repo rename. Use git clone or git push.",
  badName:
    "That's not a valid repo name. Names are up to 40 characters, " +
    "starting with a letter or number, and containing only letters, " +
    "numbers, dots, dashes, and underscores.",
  nameTaken: (name: string) =>
    `There's already a repo named ${name}. Pick another name.`,
  noAdmin: (name: string) =>
    `You don't have admin access to ${name}. Ask the owner for an admin grant.`,
  noRepo: (name: string) => `There's no repo named ${name}. Push to create it.`,
  noWrite: (name: string) =>
    `You don't have write access to ${name}. Ask the owner for a grant.`,
  unavailable: "That request failed on the server. Try again shortly.",
};

export function parseCommand(command: string): ParsedCommand | null {
  const match = commandPattern.exec(command);
  if (match === null) return null;

  return {
    service: `${match[1]}-pack` as GitService,
    target: match[2] ?? "",
  };
}

export function parseRename(command: string): ParsedRename | null {
  const match = renamePattern.exec(command);
  if (match === null) return null;

  return { from: match[1] ?? "", to: match[2] ?? "" };
}

// an abandoned channel is already gone; exiting on it throws
function finish(channel: ServerChannel, code: number): void {
  if (channel.writableEnded || channel.destroyed) return;

  channel.exit(code);
  channel.end();
}

export function refuse(channel: ServerChannel, message: string): void {
  if (!channel.writableEnded && !channel.destroyed)
    channel.stderr.write(`${message}\n`);

  finish(channel, 1);
}

function report(channel: ServerChannel, message: string): void {
  if (!channel.writableEnded && !channel.destroyed)
    channel.write(`${message}\n`);

  finish(channel, 0);
}

async function resolveTarget(
  request: ExecRequest,
  parsed: ParsedCommand,
): Promise<ResolvedRepo | null> {
  const { channel, userId } = request;

  const lookup = await resolveRepo(parsed.target);
  switch (lookup.status) {
    case "invalid":
      refuse(channel, refusals.badName);
      return null;
    case "missing":
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

// the unique index is on lower(name), so a case change isn't a collision
async function renameTarget(
  request: ExecRequest,
  parsed: ParsedRename,
): Promise<void> {
  const { channel, userId } = request;

  const to = normalizeRepoName(parsed.to);
  if (!namePattern.test(to)) {
    refuse(channel, refusals.badName);
    return;
  }

  const lookup = await resolveRepo(parsed.from);
  if (lookup.status === "invalid") {
    refuse(channel, refusals.badName);
    return;
  }
  if (lookup.status === "missing") {
    refuse(channel, refusals.noRepo(lookup.name));
    return;
  }

  const { repo } = lookup;
  if (!(await mayAdminister(repo, userId))) {
    refuse(channel, refusals.noAdmin(repo.name));
    return;
  }

  const wanted = await resolveRepo(to);
  if (wanted.status === "found" && wanted.repo.id !== repo.id) {
    refuse(channel, refusals.nameTaken(wanted.repo.name));
    return;
  }

  await renameRepo(repo.id, to);
  report(channel, `Renamed ${repo.name} to ${to}.`);
}

// exported for the contract test; server.ts only ever calls handleExec
export async function serve(
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
  if (parsed !== null) {
    const repo = await resolveTarget(request, parsed);
    if (repo === null) return;

    await serve(request, parsed, repo);
    return;
  }

  const renaming = parseRename(request.command);
  if (renaming === null) {
    refuse(request.channel, refusals.badCommand);
    return;
  }

  await renameTarget(request, renaming);
}

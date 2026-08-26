// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AuthContext, Connection, ServerChannel, Session } from "ssh2";
// default import: node's cjs lexer doesn't detect ssh2's named exports
import ssh2 from "ssh2";

import { config } from "../config.js";
import { db } from "../db.js";
import { checkAuth, type KeyStore } from "./auth.js";
import { handleExec, parseCommand, refusals, refuse } from "./exec.js";
import { loadHostKey } from "./hostkey.js";

const { Server } = ssh2;

const keyStore: KeyStore = {
  findByFingerprint: (fingerprint) =>
    db.sshKey.findUnique({
      where: { fingerprint },
      select: { id: true, userId: true, publicKey: true },
    }),
  touch: (id) =>
    db.sshKey.update({ where: { id }, data: { lastUsedAt: new Date() } }),
};

// ssh2 passes accept and reject only when the client asked for a reply
function reply(respond: (() => void) | undefined): void {
  respond?.();
}

async function authenticate(
  ctx: AuthContext,
  ip: string,
  identify: (userId: string) => void,
): Promise<void> {
  const outcome = await checkAuth(
    {
      method: ctx.method,
      username: ctx.username,
      ...(ctx.method === "publickey"
        ? {
            key: ctx.key,
            signature: ctx.signature,
            blob: ctx.blob,
            hashAlgo: ctx.hashAlgo,
          }
        : {}),
    },
    keyStore,
  );

  if (outcome.status === "reject") {
    // every client opens with a none probe
    if (ctx.method !== "none") {
      console.warn(`ssh: ${ip} rejected, ${outcome.reason}`);
    }

    ctx.reject(outcome.methods);
    return;
  }

  // identified before accepting: a session may follow the same tick
  if (outcome.status === "accept") {
    identify(outcome.key.userId);
  }

  ctx.accept();
}

function onSession(session: Session, userId: string, ip: string): void {
  let gitProtocol: string | undefined;

  // an unhandled stream error would take the whole daemon down with it
  const onError = (error: unknown) => {
    console.warn(`ssh: ${ip} channel error, ${error}`);
  };

  session.on("error", onError);
  session.on("env", (accept, reject, info) => {
    if (info.key !== "GIT_PROTOCOL") {
      reply(reject);
      return;
    }

    gitProtocol = info.val;
    reply(accept);
  });
  session.on("pty", (_accept, reject) => {
    reply(reject);
  });
  session.on("shell", (_accept, reject) => {
    reply(reject);
  });
  session.on("subsystem", (_accept, reject) => {
    reply(reject);
  });
  session.on("exec", (accept, reject, info) => {
    if (userId === "") {
      reply(reject);
      return;
    }

    const channel: ServerChannel | undefined = accept();
    if (channel === undefined) {
      return;
    }

    channel.on("error", onError);
    channel.stderr.on("error", onError);

    handleExec({ channel, command: info.command, gitProtocol, userId }).catch(
      (error: unknown) => {
        const service =
          parseCommand(info.command)?.service ?? "an unparseable command";

        console.error(`ssh: ${ip} running ${service} failed, ${error}`);
        refuse(channel, refusals.unavailable);
      },
    );
  });
}

function onConnection(client: Connection, ip: string): void {
  let userId = "";

  client.on("error", (error: unknown) => {
    console.warn(`ssh: ${ip} connection error, ${error}`);
  });
  client.on("authentication", (ctx) => {
    authenticate(ctx, ip, (id) => {
      userId = id;
    }).catch((error: unknown) => {
      console.error(`ssh: ${ip} authentication failed, ${error}`);
      ctx.reject();
    });
  });
  client.on("session", (accept) => {
    const session: Session | undefined = accept();
    if (session !== undefined) {
      onSession(session, userId, ip);
    }
  });
}

export function buildSshServer(): ssh2.Server {
  return new Server(
    { hostKeys: [loadHostKey(config.sshHostKey)] },
    (client, info) => {
      onConnection(client, info.ip);
    },
  );
}

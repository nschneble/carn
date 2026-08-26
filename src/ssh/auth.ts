// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash, timingSafeEqual } from "node:crypto";

// default import: node's cjs lexer does not detect ssh2's named exports
import ssh2 from "ssh2";

const sshUser = "git";

export type StoredKey = {
  id: string;
  userId: string;
  publicKey: string;
};

export type KeyStore = {
  findByFingerprint(fingerprint: string): Promise<StoredKey | null>;
  touch(id: string): Promise<unknown>;
};

export type AuthRequest = {
  method: string;
  username: string;
  key?: { algo: string; data: Buffer };
  signature?: Buffer;
  blob?: Buffer;
  hashAlgo?: string;
};

export type AuthOutcome =
  | { status: "probe" }
  | { status: "accept"; key: StoredKey }
  | { status: "reject"; methods?: string[]; message?: string };

export function fingerprint(blob: Buffer): string {
  const digest = createHash("sha256").update(blob).digest("base64");

  return `SHA256:${digest.replace(/=+$/, "")}`;
}

function sameBlob(stored: Buffer, offered: Buffer): boolean {
  // timingSafeEqual throws on a length mismatch
  return stored.length === offered.length && timingSafeEqual(stored, offered);
}

export async function checkAuth(
  request: AuthRequest,
  store: KeyStore,
): Promise<AuthOutcome> {
  if (request.method !== "publickey") {
    return { status: "reject", methods: ["publickey"] };
  }

  if (request.username !== sshUser) {
    return {
      status: "reject",
      message: `The SSH user must be ${sshUser}. Reconnect as ${sshUser}; your key is what identifies you.`,
    };
  }

  const offered = request.key;

  if (offered === undefined) {
    return { status: "reject" };
  }

  const row = await store.findByFingerprint(fingerprint(offered.data));

  if (row === null) {
    return { status: "reject" };
  }

  if (request.signature === undefined) {
    return { status: "probe" };
  }

  // a probe on a signed request would accept it unverified
  if (request.blob === undefined) {
    return { status: "reject" };
  }

  const stored = ssh2.utils.parseKey(row.publicKey);

  if (stored instanceof Error) {
    return { status: "reject" };
  }

  if (!sameBlob(stored.getPublicSSH(), offered.data)) {
    return { status: "reject" };
  }

  // verify returns Error as well as boolean, and an Error is truthy
  if (
    stored.verify(request.blob, request.signature, request.hashAlgo) !== true
  ) {
    return { status: "reject" };
  }

  void store.touch(row.id).catch((error: unknown) => {
    console.error(`Could not record use of ssh key ${row.id}: ${error}`);
  });

  return { status: "accept", key: row };
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash, timingSafeEqual } from "node:crypto";

import type { AuthenticationType } from "ssh2";
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

export type RejectReason =
  | "bad-method"
  | "bad-username"
  | "no-key"
  | "sha1-rsa"
  | "unknown-key"
  | "unsigned-blob"
  | "unparseable-row"
  | "key-mismatch"
  | "bad-signature";

export type AuthOutcome =
  | { status: "probe" }
  | { status: "accept"; key: StoredKey }
  | {
      status: "reject";
      reason: RejectReason;
      methods?: AuthenticationType[];
    };

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
    return { status: "reject", reason: "bad-method", methods: ["publickey"] };
  }

  if (request.username !== sshUser) {
    return { status: "reject", reason: "bad-username" };
  }

  const offered = request.key;

  if (offered === undefined) {
    return { status: "reject", reason: "no-key" };
  }

  // ssh2 leaves hashAlgo unset only for a legacy SHA-1 ssh-rsa signature
  if (offered.algo === "ssh-rsa" && request.hashAlgo === undefined) {
    return { status: "reject", reason: "sha1-rsa" };
  }

  const row = await store.findByFingerprint(fingerprint(offered.data));

  if (row === null) {
    return { status: "reject", reason: "unknown-key" };
  }

  if (request.signature === undefined) {
    return { status: "probe" };
  }

  // a probe on a signed request would accept it unverified
  if (request.blob === undefined) {
    return { status: "reject", reason: "unsigned-blob" };
  }

  const stored = ssh2.utils.parseKey(row.publicKey);

  if (stored instanceof Error) {
    return { status: "reject", reason: "unparseable-row" };
  }

  if (!sameBlob(stored.getPublicSSH(), offered.data)) {
    return { status: "reject", reason: "key-mismatch" };
  }

  // verify returns Error as well as boolean, and an Error is truthy
  if (
    stored.verify(request.blob, request.signature, request.hashAlgo) !== true
  ) {
    return { status: "reject", reason: "bad-signature" };
  }

  void store.touch(row.id).catch((error: unknown) => {
    console.error(`Could not record use of ssh key ${row.id}: ${error}`);
  });

  return { status: "accept", key: row };
}

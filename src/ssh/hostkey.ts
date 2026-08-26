// SPDX-License-Identifier: AGPL-3.0-or-later
//
// ssh2 parses OpenSSH, PEM and PuTTY private keys, but not the PKCS#8
// node:crypto emits for ed25519, so the OpenSSH container below is built
// by hand from the raw seed and public key.

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const keyType = "ssh-ed25519";

function uint32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);

  return out;
}

function sshString(value: Buffer | string): Buffer {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");

  return Buffer.concat([uint32(body.length), body]);
}

function generateKey(): string {
  const jwk = generateKeyPairSync("ed25519").privateKey.export({
    format: "jwk",
  });
  const seed = Buffer.from(jwk.d ?? "", "base64url");
  const publicKey = Buffer.from(jwk.x ?? "", "base64url");

  if (seed.length !== 32 || publicKey.length !== 32) {
    throw new Error("The generated ed25519 key is not two 32-byte halves.");
  }

  const check = randomBytes(4);
  const secrets = Buffer.concat([
    check,
    check,
    sshString(keyType),
    sshString(publicKey),
    sshString(Buffer.concat([seed, publicKey])),
    sshString(""),
  ]);
  const padding = Buffer.from(
    Array.from({ length: (8 - (secrets.length % 8)) % 8 }, (_, i) => i + 1),
  );
  const container = Buffer.concat([
    Buffer.from("openssh-key-v1\0", "latin1"),
    sshString("none"),
    sshString("none"),
    sshString(""),
    uint32(1),
    sshString(Buffer.concat([sshString(keyType), sshString(publicKey)])),
    sshString(Buffer.concat([secrets, padding])),
  ]);

  return [
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    ...(container.toString("base64").match(/.{1,70}/g) ?? []),
    "-----END OPENSSH PRIVATE KEY-----",
    "",
  ].join("\n");
}

/** @throws if the file exists with permissions looser than 0600 */
export function loadHostKey(path: string): string {
  let mode: number | undefined;

  try {
    mode = statSync(path).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (mode !== undefined) {
    if (mode & 0o077) {
      const octal = mode.toString(8).padStart(4, "0");

      throw new Error(
        `Host key ${path} is mode ${octal}, looser than 0600. Run: chmod 600 ${path}`,
      );
    }

    return readFileSync(path, "utf8");
  }

  const key = generateKey();
  mkdirSync(dirname(path), { recursive: true });
  // wx: a host key replaced behind a client's back is unrecoverable
  writeFileSync(path, key, { flag: "wx", mode: 0o600 });
  console.log(`Generated an ed25519 host key at ${path}`);

  return key;
}

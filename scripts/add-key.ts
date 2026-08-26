// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import ssh2 from "ssh2";

import { db } from "../src/db.js";
import { fingerprint } from "../src/ssh/auth.js";

const usage = "Usage: npm run key:add -- <path-to-pubkey> [name]";

type PublicKey = {
  publicKey: string;
  fingerprint: string;
  comment: string;
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readPublicKey(path: string): PublicKey {
  let text: string;

  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail(`Can't read ${path}. Pass the path to a public key file.`);
  }

  const lines = text.split("\n").filter((line) => line.trim() !== "");

  if (lines.length !== 1) {
    fail(`${path} isn't a single-line public key. Pass the .pub file.`);
  }

  const fields = lines[0].trim().split(/\s+/);

  if (fields.length < 2) {
    fail(
      `${path} isn't a public key. A line reads "<type> <base64> [comment]".`,
    );
  }

  // a private key parses whole; it never parses in the two-field form
  const publicKey = `${fields[0]} ${fields[1]}`;
  const parsed = ssh2.utils.parseKey(publicKey);

  if (parsed instanceof Error) {
    fail(`Can't read the key in ${path}: ${parsed.message}`);
  }

  return {
    publicKey,
    fingerprint: fingerprint(parsed.getPublicSSH()),
    comment: fields.slice(2).join(" "),
  };
}

const args = process.argv.slice(2);

if (args.length < 1 || args.length > 2) {
  fail(usage);
}

const path = args[0];
const key = readPublicKey(path);
const fallback = key.comment === "" ? basename(path) : key.comment;
const given = args.length === 2 ? args[1].trim() : "";
const name = given === "" ? fallback : given;

const admin = await db.user.findFirst({
  where: { isAdmin: true },
  orderBy: { createdAt: "asc" },
  select: { id: true, handle: true },
});

if (admin === null) {
  fail("No admin user. Apply the migrations with `npm run migrate` first.");
}

const existing = await db.sshKey.findUnique({
  where: { fingerprint: key.fingerprint },
  select: { id: true },
});

await db.sshKey.upsert({
  where: { fingerprint: key.fingerprint },
  create: {
    userId: admin.id,
    name,
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
  },
  update: { name },
});

const verb = existing === null ? "Added" : "Updated";

console.log(`${verb} ${key.fingerprint} as "${name}" for ${admin.handle}.`);

await db.$disconnect();

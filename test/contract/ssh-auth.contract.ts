// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import ssh2, { type ParsedKey } from "ssh2";

import {
  type AuthRequest,
  checkAuth,
  fingerprint,
  type KeyStore,
  type StoredKey,
} from "../../src/ssh/auth.js";

const dir = mkdtempSync(join(tmpdir(), "carn-ssh-auth-"));

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function keygen(name: string): { path: string; publicKey: string } {
  const path = join(dir, name);

  execFileSync("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    `${name}@carn.test`,
    "-f",
    path,
  ]);

  return { path, publicKey: readFileSync(`${path}.pub`, "utf8").trim() };
}

function parsed(text: string): ParsedKey {
  const key = ssh2.utils.parseKey(text);

  assert.ok(!(key instanceof Error), "ssh-keygen produced an unparseable key");

  return key;
}

const mine = keygen("mine");
const theirs = keygen("theirs");
const myKey = parsed(mine.publicKey);
const myPrivateKey = parsed(readFileSync(mine.path, "utf8"));
const blob = Buffer.from("session id and userauth request");

const row: StoredKey = {
  id: "9c2b1f04-0000-4000-8000-000000000001",
  userId: "9c2b1f04-0000-4000-8000-0000000000ff",
  publicKey: mine.publicKey,
};

function store(
  found: StoredKey | null,
  touched: string[] = [],
): KeyStore & { touched: string[] } {
  return {
    touched,
    findByFingerprint: () => Promise.resolve(found),
    touch: (id: string) => {
      touched.push(id);

      return Promise.resolve();
    },
  };
}

function request(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    method: "publickey",
    username: "git",
    key: { algo: "ssh-ed25519", data: myKey.getPublicSSH() },
    ...overrides,
  };
}

function signed(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return request({
    signature: myPrivateKey.sign(blob),
    blob,
    ...overrides,
  });
}

test("the fingerprint matches ssh-keygen -lf byte for byte", () => {
  const line = execFileSync("ssh-keygen", ["-lf", `${mine.path}.pub`], {
    encoding: "utf8",
  });

  assert.strictEqual(fingerprint(myKey.getPublicSSH()), line.split(" ")[1]);
});

test("a method other than publickey is rejected, offering publickey", async () => {
  const outcome = await checkAuth(request({ method: "password" }), store(row));

  assert.deepStrictEqual(outcome, {
    status: "reject",
    methods: ["publickey"],
  });
});

test("a username other than git is rejected, and the message says git", async () => {
  const outcome = await checkAuth(request({ username: "nick" }), store(row));

  assert.strictEqual(outcome.status, "reject");
  assert.match(
    outcome.status === "reject" ? (outcome.message ?? "") : "",
    /\bgit\b/,
  );
});

test("a fingerprint with no row is rejected", async () => {
  const outcome = await checkAuth(signed(), store(null));

  assert.deepStrictEqual(outcome, { status: "reject" });
});

test("the first callback carries no signature and is accepted", async () => {
  const keys = store(row);
  const outcome = await checkAuth(request(), keys);

  assert.deepStrictEqual(outcome, { status: "probe" });
  assert.deepStrictEqual(keys.touched, [], "the probe recorded a use");
});

test("a signature with nothing to verify it against is rejected", async () => {
  const outcome = await checkAuth(signed({ blob: undefined }), store(row));

  assert.deepStrictEqual(outcome, { status: "reject" });
});

test("a wrong signature is rejected though the fingerprint matched", async () => {
  const signature = myPrivateKey.sign(blob);
  signature[0] ^= 0xff;

  const keys = store(row);
  const outcome = await checkAuth(signed({ signature }), keys);

  assert.deepStrictEqual(outcome, { status: "reject" });
  assert.deepStrictEqual(keys.touched, []);
});

test("a signature over other data is rejected", async () => {
  const outcome = await checkAuth(
    signed({ blob: Buffer.from("some other request") }),
    store(row),
  );

  assert.deepStrictEqual(outcome, { status: "reject" });
});

test("a row whose stored key is not the offered key is rejected", async () => {
  const outcome = await checkAuth(
    signed(),
    store({ ...row, publicKey: theirs.publicKey }),
  );

  assert.deepStrictEqual(outcome, { status: "reject" });
});

test("a stored key of another length is rejected, not thrown on", async () => {
  const short = myKey.getPublicSSH().subarray(0, 20);
  const outcome = await checkAuth(
    signed({ key: { algo: "ssh-ed25519", data: short } }),
    store(row),
  );

  assert.deepStrictEqual(outcome, { status: "reject" });
});

test("a hash algorithm verify cannot use is rejected", async () => {
  const outcome = await checkAuth(
    signed({ hashAlgo: "ssh-ed25519" }),
    store(row),
  );

  assert.deepStrictEqual(outcome, { status: "reject" });
});

test("a row that will not parse is rejected", async () => {
  const outcome = await checkAuth(
    signed(),
    store({ ...row, publicKey: "ssh-ed25519 not-a-key" }),
  );

  assert.deepStrictEqual(outcome, { status: "reject" });
});

test("a good signature is accepted and records the use", async () => {
  const keys = store(row);
  const outcome = await checkAuth(signed(), keys);

  assert.deepStrictEqual(outcome, { status: "accept", key: row });
  assert.deepStrictEqual(keys.touched, [row.id]);
});

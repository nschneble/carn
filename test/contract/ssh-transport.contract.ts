// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Real git over real ssh against a real listener. No ssh2 client and no
// mocked channel: every assertion below is downstream of bytes a stock
// git and a stock ssh actually put on a socket.

import assert from "node:assert";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const root = mkdtempSync(join(tmpdir(), "carn-ssh-transport-"));
const repoRoot = join(root, "repos");
const run = process.pid;
const fresh = `carn-e2e-fresh-${run}`;

process.env.CARN_REPO_ROOT = repoRoot;
process.env.CARN_SSH_HOST_KEY = join(root, "host_key");

// config freezes on first import, so it must not be loaded above this
const { db } = await import("../../src/db.js");
const { repoPath } = await import("../../src/repos/resolve.js");
const { buildSshServer } = await import("../../src/ssh/server.js");

type Actor = { id: string; keyPath: string };
type Run = { code: number; stdout: string; stderr: string };

const clientOptions = [
  "-o",
  "IdentitiesOnly=yes",
  "-o",
  "StrictHostKeyChecking=no",
  "-o",
  "UserKnownHostsFile=/dev/null",
  "-o",
  "LogLevel=ERROR",
  "-o",
  "BatchMode=yes",
];

let port = 0;
let server: ReturnType<typeof buildSshServer> | undefined;
const owner: Actor = { id: "", keyPath: join(root, "owner") };
const stranger: Actor = { id: "", keyPath: join(root, "stranger") };
const nobody: Actor = { id: "", keyPath: join(root, "nobody") };

// spawnSync would block the loop the listener under test runs on
function exec(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.stdin.end();
    child.on("close", (code) => {
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function keygen(path: string): string {
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", path]);

  return readFileSync(`${path}.pub`, "utf8").trim();
}

function fingerprintOf(path: string): string {
  const line = execFileSync("ssh-keygen", ["-lf", `${path}.pub`], {
    encoding: "utf8",
  });

  return line.split(" ")[1] ?? "";
}

function git(
  actor: Actor,
  args: string[],
  cwd = root,
  extra: NodeJS.ProcessEnv = {},
): Promise<Run> {
  return exec("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_SSH_COMMAND: ["ssh", "-i", actor.keyPath, ...clientOptions].join(" "),
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@carn.test",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@carn.test",
      ...extra,
    },
  });
}

function ssh(options: string[], trailing: string[]): Promise<Run> {
  return exec(
    "ssh",
    [
      "-i",
      owner.keyPath,
      ...clientOptions,
      ...options,
      "-p",
      String(port),
      "git@127.0.0.1",
      ...trailing,
    ],
    { cwd: root },
  );
}

function url(name: string): string {
  return `ssh://git@127.0.0.1:${port}/${name}`;
}

function refPath(id: string, name: string): string {
  return join(repoPath(id), "refs", "heads", name);
}

async function makeActor(actor: Actor, handle: string): Promise<void> {
  const publicKey = keygen(actor.keyPath);
  const user = await db.user.create({
    data: { handle, displayName: handle, email: `${handle}@carn.test` },
    select: { id: true },
  });

  actor.id = user.id;
  await db.sshKey.create({
    data: {
      userId: user.id,
      name: handle,
      publicKey,
      fingerprint: fingerprintOf(actor.keyPath),
    },
  });
}

async function seedWorkTree(dir: string, content: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), content);
  await git(owner, ["init", "-q", "-b", "main"], dir);
  await git(owner, ["add", "README.md"], dir);
  await git(owner, ["commit", "-q", "-m", "first"], dir);
}

describe("ssh transport", {
  skip:
    process.env.DATABASE_URL === undefined ? "DATABASE_URL is unset" : false,
}, () => {
  before(async () => {
    const listener = buildSshServer();
    server = listener;

    await new Promise<void>((resolve, reject) => {
      listener.once("error", reject);
      listener.listen(0, "127.0.0.1", resolve);
    });

    const address = listener.address();
    assert.ok(address !== null && typeof address === "object");
    port = address.port;

    await makeActor(owner, `carn-e2e-owner-${run}`);
    await makeActor(stranger, `carn-e2e-stranger-${run}`);
    keygen(nobody.keyPath);
  });

  after(async () => {
    server?.close();

    const ids = [owner.id, stranger.id].filter((id) => id !== "");

    if (ids.length > 0) {
      await db.repo.deleteMany({ where: { ownerId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }

    await db.$disconnect();
    rmSync(root, { recursive: true, force: true });
  });

  it("pushes to a name with no row, creating exactly one repo", async () => {
    const work = join(root, "fresh");
    await seedWorkTree(work, "hello from carn\n");

    const pushed = await git(
      owner,
      ["push", url(fresh), "main:refs/heads/main"],
      work,
    );

    assert.strictEqual(pushed.code, 0, pushed.stderr);
    assert.doesNotMatch(
      pushed.stderr,
      /failed to push some refs/,
      "the exit status was lost, so a working push reported failure",
    );

    const rows = await db.repo.findMany({ where: { name: fresh } });
    assert.strictEqual(rows.length, 1, "push-to-create made the wrong count");

    const row = rows[0];
    assert.ok(row);
    assert.strictEqual(row.ownerId, owner.id, "the pusher does not own it");
    assert.strictEqual(
      repoPath(row.id),
      join(repoRoot, row.id.slice(0, 2), `${row.id}.git`),
      "the path is not derived from the row id",
    );
    assert.strictEqual(existsSync(repoPath(row.id)), true);
    assert.strictEqual(
      readFileSync(join(repoPath(row.id), "HEAD"), "utf8").trim(),
      `ref: refs/heads/${row.defaultBranch}`,
    );
  });

  it("clones back exactly what was pushed", async () => {
    const into = join(root, "clone");
    const cloned = await git(owner, ["clone", "-q", url(fresh), into]);

    assert.strictEqual(cloned.code, 0, cloned.stderr);
    assert.strictEqual(
      readFileSync(join(into, "README.md"), "utf8"),
      "hello from carn\n",
    );
  });

  it("negotiates protocol v2, so GIT_PROTOCOL reached the child", async () => {
    const listed = await git(owner, ["ls-remote", url(fresh)], root, {
      GIT_TRACE_PACKET: "1",
    });

    assert.strictEqual(listed.code, 0, listed.stderr);
    // the trace prefixes the subcommand, not "git"
    assert.match(
      listed.stderr,
      /packet:\s+ls-remote<\s+version 2/,
      "upload-pack answered v0, so the env var never arrived",
    );
  });

  it("pushes a second time without creating a second row", async () => {
    const work = join(root, "fresh");
    writeFileSync(join(work, "README.md"), "second push\n");
    await git(owner, ["commit", "-qam", "second"], work);

    const pushed = await git(
      owner,
      ["push", url(fresh), "main:refs/heads/main"],
      work,
    );

    assert.strictEqual(pushed.code, 0, pushed.stderr);
    assert.strictEqual(await db.repo.count({ where: { name: fresh } }), 1);
  });

  it("refuses a stranger's push and leaves the ref where it was", async () => {
    const row = await db.repo.findFirstOrThrow({ where: { name: fresh } });
    const started = readFileSync(refPath(row.id, "main"), "utf8").trim();
    const work = join(root, "intruder");
    await seedWorkTree(work, "not yours\n");

    const pushed = await git(
      stranger,
      ["push", "--force", url(fresh), "main:refs/heads/main"],
      work,
    );

    assert.notStrictEqual(pushed.code, 0, "the unauthorized push succeeded");
    assert.ok(
      pushed.stderr.includes(
        `You don't have write access to ${fresh}. Ask the owner for a grant.`,
      ),
      pushed.stderr,
    );
    assert.strictEqual(
      readFileSync(refPath(row.id, "main"), "utf8").trim(),
      started,
      "the ref moved under a refused push",
    );
  });

  it("still serves that stranger a clone, because reads are public", async () => {
    const into = join(root, "public-clone");
    const cloned = await git(stranger, ["clone", "-q", url(fresh), into]);

    assert.strictEqual(cloned.code, 0, cloned.stderr);
    assert.strictEqual(existsSync(join(into, "README.md")), true);
  });

  it("lets a write grant push where ownership did not", async () => {
    const row = await db.repo.findFirstOrThrow({ where: { name: fresh } });

    await db.repoGrant.create({
      data: { repoId: row.id, userId: stranger.id, level: "write" },
    });

    const work = join(root, "intruder");
    const pushed = await git(
      stranger,
      ["push", url(fresh), "main:refs/heads/granted"],
      work,
    );

    assert.strictEqual(pushed.code, 0, pushed.stderr);
    assert.strictEqual(existsSync(refPath(row.id, "granted")), true);
  });

  it("refuses upload-pack on a missing name and creates nothing", async () => {
    const name = `carn-e2e-absent-${run}`;
    const into = join(root, "absent");
    const cloned = await git(owner, ["clone", "-q", url(name), into]);

    assert.notStrictEqual(cloned.code, 0, "a missing repo cloned");
    assert.ok(
      cloned.stderr.includes(
        `There is no repo named ${name}. Push to it to create it.`,
      ),
      cloned.stderr,
    );
    assert.strictEqual(await db.repo.count({ where: { name } }), 0);
    assert.strictEqual(existsSync(into), false);
  });

  it("refuses a name failing the format rule, creating nothing", async () => {
    const started = await db.repo.count();

    for (const bad of ["../etc", "-x", ".hidden", "a".repeat(65)]) {
      const cloned = await git(owner, [
        "clone",
        "-q",
        `ssh://git@127.0.0.1:${port}/${bad}`,
        join(root, `bad-${bad.length}`),
      ]);

      assert.notStrictEqual(cloned.code, 0, `${bad} was accepted`);
      assert.match(cloned.stderr, /not a valid repo name/, cloned.stderr);
    }

    assert.strictEqual(
      await db.repo.count(),
      started,
      "a name that never reached the database still made a row",
    );
  });

  it("rejects a key with no row", async () => {
    const cloned = await git(nobody, [
      "clone",
      "-q",
      url(fresh),
      join(root, "nobody-clone"),
    ]);

    assert.notStrictEqual(cloned.code, 0, "an unknown key was let in");
    assert.match(cloned.stderr, /Permission denied|publickey/i, cloned.stderr);
  });

  it("records last_used_at after a real handshake", async () => {
    const key = await db.sshKey.findFirstOrThrow({
      where: { userId: owner.id },
    });

    assert.notStrictEqual(key.lastUsedAt, null);
    assert.ok(
      key.lastUsedAt !== null && key.lastUsedAt >= key.createdAt,
      "last_used_at is not later than created_at",
    );
  });

  it("refuses shell, pty and the sftp subsystem", async () => {
    assert.notStrictEqual(
      (await ssh([], [])).code,
      0,
      "an interactive shell was granted",
    );
    assert.notStrictEqual(
      (await ssh(["-T"], [])).code,
      0,
      "a shell was granted",
    );
    assert.notStrictEqual(
      (await ssh(["-s"], ["sftp"])).code,
      0,
      "the sftp subsystem was granted",
    );
  });

  it("refuses an exec that is not one of the two git services", async () => {
    const other = await ssh([], ["id"]);

    assert.notStrictEqual(other.code, 0, "an arbitrary command ran");
    assert.match(
      other.stderr,
      /This server runs git-upload-pack and git-receive-pack only/,
      other.stderr,
    );
  });
});

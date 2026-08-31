// SPDX-License-Identifier: AGPL-3.0-or-later

// the route is answered over the real route table, because the status, the
// content type and the immutable Cache-Control are what a browser reads and
// none of them is visible in a screenshot. only the repo row lookup is
// stubbed: the repo on disk, the handler and the git below it are real

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "carn-header-route-"));

process.env.CARN_REPO_ROOT = dir;
process.env.DATABASE_URL ??= "postgresql://nobody:nobody@127.0.0.1:1/nothing";
process.env.LOG_LEVEL = "silent";

const { db } = await import("../../src/db.js");
const { headerType } = await import("../../src/repos/header-asset.js");

const served = "11111111-1111-4111-8111-111111111111";
const ghost = "22222222-2222-4222-8222-222222222222";

const forever = "public, max-age=31536000, immutable";
const noImage = "No such header image.\n";
const imageFailed = "The header image failed to load. Try again shortly.\n";
const plain = "text/plain; charset=utf-8";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400"></svg>\n';
const readme = "# Linklater\n";

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function git(repoPath: string, args: string[]): string {
  return execFileSync(
    "git",
    ["-C", repoPath, "-c", "user.email=t@t", "-c", "user.name=t", ...args],
    {
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
    },
  ).trim();
}

function build(id: string): string {
  const path = join(dir, id.slice(0, 2), `${id}.git`);

  mkdirSync(join(path, ".carn"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", "--", path]);
  writeFileSync(join(path, ".carn/header.svg"), svg);
  writeFileSync(join(path, "README.md"), readme);
  git(path, ["add", "-A"]);
  git(path, ["commit", "-qm", "Lay the header down"]);

  return path;
}

const repoPath = build(served);
const headerOid = git(repoPath, ["rev-parse", "HEAD:.carn/header.svg"]);
const readmeOid = git(repoPath, ["rev-parse", "HEAD:README.md"]);

// the one raw read the route makes, answered from the name it was given:
// linklater is on disk and ghost is a row whose repo is not
db.$queryRaw = ((_strings: TemplateStringsArray, name: string) =>
  Promise.resolve(
    name === "linklater" || name === "ghost"
      ? [
          {
            id: name === "linklater" ? served : ghost,
            name,
            ownerId: "66666666-6666-4666-8666-666666666666",
            defaultBranch: "main",
          },
        ]
      : [],
  )) as never;

const { buildApp } = await import("../../src/app.js");

const app = buildApp();

after(async () => {
  await app.close();
});

function get(url: string) {
  return app.inject({ method: "GET", url });
}

test("an asset that is not an oid and an svg is refused before the repo", async () => {
  for (const asset of [
    "header.svg",
    headerOid,
    `${headerOid}.png`,
    `${headerOid.slice(0, 39)}.svg`,
    `${headerOid.toUpperCase()}.svg`,
  ]) {
    const response = await get(`/r/linklater/header/${asset}`);

    assert.strictEqual(response.statusCode, 404, asset);
    assert.strictEqual(response.body, noImage, asset);
    assert.strictEqual(response.headers["content-type"], plain, asset);
  }
});

test("a committed header serves as svg, cached forever", async () => {
  const response = await get(`/r/linklater/header/${headerOid}.svg`);

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.headers["content-type"], headerType);
  assert.strictEqual(response.headers["cache-control"], forever);
  assert.strictEqual(response.body, svg);
});

test("an oid the repo holds but no slot claims is not a header", async () => {
  const response = await get(`/r/linklater/header/${readmeOid}.svg`);

  assert.strictEqual(response.statusCode, 404);
  assert.strictEqual(response.body, noImage);
  assert.strictEqual(response.headers["content-type"], plain);
  assert.doesNotMatch(response.body, /Linklater/);
});

test("an oid of nothing at all is refused without a read", async () => {
  const response = await get(`/r/linklater/header/${"0".repeat(40)}.svg`);

  assert.strictEqual(response.statusCode, 404);
  assert.strictEqual(response.body, noImage);
});

test("a row whose repo is not on disk is unavailable, not missing", async () => {
  const response = await get(`/r/ghost/header/${headerOid}.svg`);

  assert.strictEqual(response.statusCode, 503);
  assert.strictEqual(response.body, imageFailed);
  assert.strictEqual(response.headers["content-type"], plain);
});

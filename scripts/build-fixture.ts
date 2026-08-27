// SPDX-License-Identifier: AGPL-3.0-or-later

// regenerates test/fixtures/repos.tar, the pinned bare repos every visual
// story renders. run it deliberately and review the diff; nothing rebuilds
// it per run. plumbing only, and the tar headers are written here because
// no platform tar pins mode, owner, and mtime portably

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import {
  fixtureAuthor,
  fixtureRepoPath,
  fixtureRepos,
} from "../test/support/fixture-repos.js";

const root = resolve(import.meta.dirname, "../..");
const target = join(root, "test/fixtures/repos.tar");
const blockSize = 512;
const blockingFactor = 20;
const pinnedMtime = Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000);

function git(args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  }).trim();
}

function blob(body: string, gitDir: string, env: NodeJS.ProcessEnv): string {
  return execFileSync("git", ["hash-object", "-w", "--stdin"], {
    cwd: gitDir,
    encoding: "utf8",
    env: {
      ...env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
    input: body,
  }).trim();
}

function buildRepo(stage: string, work: string): void {
  for (const repo of fixtureRepos) {
    const gitDir = join(stage, fixtureRepoPath(repo.id));

    mkdirSync(gitDir, { recursive: true });
    git(["init", "--bare", "--initial-branch=main", "."], gitDir, {});
    rmSync(join(gitDir, "hooks"), { recursive: true, force: true });
    rmSync(join(gitDir, "description"), { force: true });

    if (repo.commit === null) continue;

    const index = join(work, `${repo.name}.index`);
    const message = join(work, `${repo.name}.message`);
    const env = { GIT_DIR: gitDir, GIT_INDEX_FILE: index };

    for (const file of repo.commit.files) {
      const oid = blob(file.body, gitDir, env);
      git(
        ["update-index", "--add", "--cacheinfo", `100644,${oid},${file.path}`],
        gitDir,
        env,
      );
    }

    const stamp = `${Math.floor(Date.parse(repo.commit.at) / 1000)} +0000`;
    const tree = git(["write-tree"], gitDir, env);

    writeFileSync(message, `${repo.commit.message}\n`);

    const commit = git(["commit-tree", tree, "-F", message], gitDir, {
      ...env,
      GIT_AUTHOR_NAME: fixtureAuthor.name,
      GIT_AUTHOR_EMAIL: fixtureAuthor.email,
      GIT_AUTHOR_DATE: stamp,
      GIT_COMMITTER_NAME: fixtureAuthor.name,
      GIT_COMMITTER_EMAIL: fixtureAuthor.email,
      GIT_COMMITTER_DATE: stamp,
    });

    git(["update-ref", "refs/heads/main", commit], gitDir, env);
  }
}

function walk(dir: string, base: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const name = relative(base, path);

    if (entry.isDirectory()) {
      found.push(`${name}/`, ...walk(path, base));
    } else if (entry.isFile()) {
      found.push(name);
    }
  }

  return found.sort();
}

function octal(value: number, width: number): string {
  return value
    .toString(8)
    .padStart(width - 1, "0")
    .padEnd(width, "\0");
}

function header(name: string, size: number, directory: boolean): Buffer {
  if (Buffer.byteLength(name) > 99) {
    throw new Error(`tar: "${name}" needs a prefix field this writer omits`);
  }

  const block = Buffer.alloc(blockSize);

  block.write(name, 0, "utf8");
  block.write(octal(directory ? 0o755 : 0o644, 8), 100);
  block.write(octal(0, 8), 108);
  block.write(octal(0, 8), 116);
  block.write(octal(size, 12), 124);
  block.write(octal(pinnedMtime, 12), 136);
  block.write("        ", 148);
  block.write(directory ? "5" : "0", 156);
  block.write("ustar\0", 257);
  block.write("00", 263);

  let sum = 0;
  for (const byte of block) sum += byte;

  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return block;
}

function archive(stage: string): Buffer {
  const blocks: Buffer[] = [];

  for (const name of walk(stage, stage)) {
    const directory = name.endsWith("/");
    const body = directory ? Buffer.alloc(0) : readFileSync(join(stage, name));

    blocks.push(header(name, body.length, directory));

    if (body.length === 0) continue;

    const padded = Math.ceil(body.length / blockSize) * blockSize;
    blocks.push(Buffer.concat([body], padded));
  }

  const written = Buffer.concat(blocks);
  const total =
    Math.ceil((written.length + 2 * blockSize) / (blockSize * blockingFactor)) *
    blockSize *
    blockingFactor;

  return Buffer.concat([written], total);
}

const work = mkdtempSync(join(tmpdir(), "carn-fixture-"));
const stage = join(work, "repos");

try {
  mkdirSync(stage, { recursive: true });
  buildRepo(stage, work);
  writeFileSync(target, archive(stage));
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`${relative(root, target)} — ${statSync(target).size} B`);

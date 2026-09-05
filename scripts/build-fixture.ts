// SPDX-License-Identifier: AGPL-3.0-or-later

// plumbing only; regenerates test/fixtures/repos.tar, the pinned bare
// repos every visual story renders

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

function blob(
  body: string | Buffer,
  gitDir: string,
  env: NodeJS.ProcessEnv,
): string {
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

function stampOf(at: string): string {
  return `${Math.floor(Date.parse(at) / 1000)} +0000`;
}

function identity(stamp: string): NodeJS.ProcessEnv {
  return {
    GIT_AUTHOR_NAME: fixtureAuthor.name,
    GIT_AUTHOR_EMAIL: fixtureAuthor.email,
    GIT_AUTHOR_DATE: stamp,
    GIT_COMMITTER_NAME: fixtureAuthor.name,
    GIT_COMMITTER_EMAIL: fixtureAuthor.email,
    GIT_COMMITTER_DATE: stamp,
  };
}

// without this an out-of-range ordinal reaches execFileSync as undefined
function commitAt(
  written: string[],
  repo: string,
  ref: string,
  ordinal: number,
): string {
  const oid = written.at(ordinal);

  if (oid === undefined) {
    throw new Error(
      `${repo}: ${ref} names commit ${ordinal}, and only ${written.length} were written`,
    );
  }

  return oid;
}

function buildRepo(stage: string, work: string): Map<string, string> {
  const tips = new Map<string, string>();

  for (const repo of fixtureRepos) {
    const gitDir = join(stage, fixtureRepoPath(repo.id));

    mkdirSync(gitDir, { recursive: true });
    git(["init", "--bare", "--initial-branch=main", "."], gitDir, {});
    rmSync(join(gitDir, "hooks"), { recursive: true, force: true });
    rmSync(join(gitDir, "description"), { force: true });

    const index = join(work, `${repo.name}.index`);
    const message = join(work, `${repo.name}.message`);
    const env = { GIT_DIR: gitDir, GIT_INDEX_FILE: index };
    const written: string[] = [];

    // the index carries forward, so a commit's diff is only what it names
    for (const entry of repo.commits) {
      for (const file of entry.files) {
        const mode = file.gitlink === undefined ? "100644" : "160000";
        const oid = file.gitlink ?? blob(file.body, gitDir, env);

        git(
          [
            "update-index",
            "--add",
            "--cacheinfo",
            `${mode},${oid},${file.path}`,
          ],
          gitDir,
          env,
        );
      }

      const stamp = stampOf(entry.at);
      const tree = git(["write-tree"], gitDir, env);
      const parent = written.at(-1);

      writeFileSync(message, `${entry.message}\n`);

      written.push(
        git(
          [
            "commit-tree",
            tree,
            ...(parent === undefined ? [] : ["-p", parent]),
            "-F",
            message,
          ],
          gitDir,
          { ...env, ...identity(stamp) },
        ),
      );
    }

    if (written.length > 0) {
      const tip = commitAt(written, repo.name, "refs/heads/main", -1);

      git(["update-ref", "refs/heads/main", tip], gitDir, env);
      tips.set(repo.name, tip);
    }

    for (const branch of repo.branches ?? []) {
      const ref = `refs/heads/${branch.name}`;

      git(
        ["update-ref", ref, commitAt(written, repo.name, ref, branch.commit)],
        gitDir,
        env,
      );
    }

    for (const tag of repo.tags ?? []) {
      const ref = `refs/tags/${tag.name}`;
      const tagged = commitAt(written, repo.name, ref, tag.commit);

      if (tag.kind === "lightweight") {
        git(["update-ref", ref, tagged], gitDir, env);
        continue;
      }

      writeFileSync(message, `${tag.message}\n`);

      // the tagger date is GIT_COMMITTER_DATE, never GIT_AUTHOR_DATE
      git(["tag", "-a", "-F", message, tag.name, tagged], gitDir, {
        ...env,
        ...identity(stampOf(tag.taggedAt)),
      });
    }
  }

  return tips;
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

  const tips = buildRepo(stage, work);

  writeFileSync(target, archive(stage));
  console.log(`${relative(root, target)} — ${statSync(target).size} B`);

  // tuffgal/actions pins a tip sha by hand, so a rebuild prints them all
  for (const [name, tip] of tips) console.log(`  ${name} ${tip}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

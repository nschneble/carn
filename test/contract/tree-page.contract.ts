// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { treeRowCap } from "../../src/html/tree-list.js";
import { treePage } from "../../src/html/tree-page.js";
import { budgetBytes, pageWireBytes } from "../../src/html/wire-weight.js";
import {
  listTree,
  orderTreeEntries,
  resolveTip,
  type TreeEntry,
} from "../../src/repos/tree.js";
import { treeDocument, withSubmodule } from "../gallery/tree.js";

const root = resolve(import.meta.dirname, "../../..");
const dir = mkdtempSync(join(tmpdir(), "carn-tree-"));
const shim = join(dir, "shim");
const calls = join(shim, "calls");
const realGit = execFileSync("sh", ["-c", "command -v git"], {
  encoding: "utf8",
}).trim();

const now = new Date("2026-02-01T12:00:00.000Z");
const pinned = "a".repeat(40);

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function git(repoPath: string, args: string[], at?: string): string {
  const stamp =
    at === undefined
      ? {}
      : {
          GIT_AUTHOR_DATE: at,
          GIT_COMMITTER_DATE: at,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t",
        };

  return execFileSync(
    "git",
    ["-C", repoPath, "-c", "user.email=t@t", "-c", "user.name=t", ...args],
    {
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", ...stamp },
    },
  ).trim();
}

function write(repoPath: string, path: string, body: string): void {
  mkdirSync(join(repoPath, path, ".."), { recursive: true });
  writeFileSync(join(repoPath, path), body);
}

// three commits, so the walk has a boundary to fall off. the gitlink goes
// in through plumbing: a real submodule needs a second repo on disk, and
// the mode is the whole of what detection reads
function build(): string {
  const path = mkdtempSync(join(dir, "repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", "--", path]);

  write(path, "README.md", "# fixture\n");
  write(path, "src/index.ts", "export {};\n");
  write(path, "src/store.ts", "export const rows = [];\n");
  write(path, "src/deep/inner.ts", "export {};\n");
  git(path, ["add", "-A"]);
  git(path, ["commit", "-qm", "Lay the tree down"], "2026-01-10T00:00:00Z");

  write(path, "src/store.ts", "export const rows = [0];\n");
  git(path, ["add", "-A"]);
  git(path, ["commit", "-qm", "Seed the store"], "2026-01-11T00:00:00Z");

  git(path, [
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${pinned},src/vendor`,
  ]);

  const at = "2026-01-12T00:00:00Z";
  const tree = git(path, ["write-tree"], at);
  const head = git(path, ["rev-parse", "HEAD"]);
  const commit = git(
    path,
    ["commit-tree", tree, "-p", head, "-m", "Pin the vendored tree"],
    at,
  );

  git(path, ["update-ref", "refs/heads/main", commit]);

  return path;
}

const repoPath = build();

mkdirSync(shim, { recursive: true });
writeFileSync(
  join(shim, "git"),
  `#!/bin/sh\nprintf '%s\\n' "$*" >> ${calls}\nexec ${realGit} "$@"\n`,
);
chmodSync(join(shim, "git"), 0o755);

// the shim is only on PATH inside this helper, so the fixture build above
// never lands in the recording
async function record<T>(run: () => Promise<T>): Promise<[T, string[]]> {
  const originalPath = process.env.PATH;
  writeFileSync(calls, "");
  process.env.PATH = `${shim}:${originalPath ?? ""}`;

  try {
    const result = await run();
    const argv = readFileSync(calls, "utf8").split("\n").filter(Boolean);

    return [result, argv];
  } finally {
    process.env.PATH = originalPath;
  }
}

async function tip(): Promise<string> {
  const found = await resolveTip({ repoPath, branch: "main" });
  assert.ok(found, "the fixture has no main");
  return found;
}

function rows(markup: string): number {
  return [...markup.matchAll(/<li class="row(?: is-dir| is-sub)?">/g)].length;
}

function rowFor(markup: string, name: string): string {
  const found = markup
    .split("<li ")
    .find((block) => block.includes(`>${name}</`) || block.includes(name));

  assert.ok(found, `no row for ${name}`);
  return found.slice(0, found.indexOf("</li>"));
}

function subjects(entries: TreeEntry[]): Record<string, string | null> {
  return Object.fromEntries(
    entries.map((entry) => [entry.name, entry.touched?.subject ?? null]),
  );
}

function widePage(count: number, showAll: boolean): string {
  return treeDocument({
    showAll,
    tree: {
      path: "src/components",
      entries: Array.from({ length: count }, (_, index) => ({
        name: `Fixture${index}.tsx`,
        oid: "0".repeat(40),
        kind: "file" as const,
        bytes: 512,
        touched: null,
      })),
    },
  });
}

test("a nested path lists its own entries, not the root's", async () => {
  const tree = await listTree({ repoPath, rev: await tip(), path: "src" });

  assert.ok(tree);
  assert.strictEqual(tree.path, "src");
  assert.deepStrictEqual(
    tree.entries.map((entry) => `${entry.name} ${entry.kind}`),
    ["deep directory", "index.ts file", "store.ts file", "vendor gitlink"],
    "directories sort first, then everything else by name",
  );
});

// both orders on purpose: ls-tree hands the parser its entries in name
// order already, so the listing comes out right either way and only an
// input git never produces tells a real sort from a lucky one
test("a gitlink sorts by name beside the files, whichever way round", () => {
  const named: TreeEntry[] = (
    [
      { name: "zeta", kind: "directory" },
      { name: "alpha", kind: "gitlink" },
      { name: "beta", kind: "file" },
      { name: "aardvark", kind: "directory" },
      { name: "yankee", kind: "gitlink" },
    ] as const
  ).map((entry) => ({
    ...entry,
    oid: "0".repeat(40),
    bytes: null,
    touched: null,
  }));

  const expected = ["aardvark", "zeta", "alpha", "beta", "yankee"];

  for (const entries of [named, [...named].reverse()]) {
    assert.deepStrictEqual(
      [...entries].sort(orderTreeEntries).map((entry) => entry.name),
      expected,
      "the listing order depends on what the sort was handed",
    );
  }
});

test("a listing costs one ls-tree and one log, at every depth", async (t) => {
  const rev = await tip();

  for (const path of [undefined, "src"]) {
    const where = path ?? "the root";
    const [tree, argv] = await record(() => listTree({ repoPath, rev, path }));

    assert.ok(tree, `${where} listed nothing`);
    assert.strictEqual(
      argv.filter((one) => one.startsWith("ls-tree ")).length,
      1,
      `${where} cost more than one ls-tree:\n${argv.join("\n")}`,
    );
    assert.strictEqual(
      argv.filter((one) => one.startsWith("log ")).length,
      1,
      `${where} walked the log more than once, so the columns cost a spawn per row:\n${argv.join("\n")}`,
    );
    assert.strictEqual(
      argv.length,
      2,
      `${where} spawned git ${argv.length} times:\n${argv.join("\n")}`,
    );

    t.diagnostic(`${where}: ${argv.length} spawns`);
  }
});

test("the bounded walk attributes what it reaches and blanks the rest", async () => {
  const rev = await tip();

  const whole = await listTree({ repoPath, rev, path: "src" });
  assert.ok(whole);
  assert.deepStrictEqual(subjects(whole.entries), {
    deep: "Lay the tree down",
    "index.ts": "Lay the tree down",
    "store.ts": "Seed the store",
    vendor: "Pin the vendored tree",
  });

  // two commits of history reach the gitlink and the store and nothing
  // else, which is the direction the cap exists for: blank, not broken,
  // and not a longer walk
  const cut = await listTree({ repoPath, rev, path: "src", cap: 2 });
  assert.ok(cut);
  assert.deepStrictEqual(subjects(cut.entries), {
    deep: null,
    "index.ts": null,
    "store.ts": "Seed the store",
    vendor: "Pin the vendored tree",
  });

  const markup = treePage({
    repo: "linklater",
    rev,
    tree: cut,
    showAll: false,
    now,
  });

  assert.strictEqual(rows(markup), 4, "an un-attributed row stopped rendering");
  assert.ok(
    rowFor(markup, "index.ts").includes(
      '<span class="msg"></span><span class="age"></span>',
    ),
    "an un-attributed row rendered something other than empty columns",
  );
  assert.ok(
    rowFor(markup, "store.ts").includes(
      '<span class="msg">Seed the store</span>',
    ),
    "the attributed row lost its subject",
  );

  // a gitlink carries a pinned sha rather than a subject and age, so its
  // attribution never reaches the markup
  assert.doesNotMatch(
    markup,
    /Pin the vendored tree/,
    "a gitlink row grew the subject and age columns",
  );
});

test("a path that is not a tree is nothing, never a redirect", async () => {
  const rev = await tip();

  for (const path of [
    "README.md",
    "src/index.ts",
    "src/vendor",
    "nope",
    "src/nope",
    ":(glob)**",
    "src/../README.md",
    "/src",
    "src/",
  ]) {
    assert.strictEqual(
      await listTree({ repoPath, rev, path }),
      null,
      `${path} listed something`,
    );
  }
});

test("a ref that is not a ref is nothing", async () => {
  for (const rev of ["-x", "nope", "refs/heads/nope", "main..main", ""]) {
    assert.strictEqual(
      await listTree({ repoPath, rev, path: "src" }),
      null,
      `${rev} listed something`,
    );
  }
});

test("the cap and the lift work at a nested depth too", () => {
  const capped = widePage(20, false);
  const all = widePage(20, true);

  assert.strictEqual(rows(capped), treeRowCap);
  assert.strictEqual(rows(all), 20);
  assert.ok(
    capped.includes(
      'href="/r/linklater/tree/main/src/components?all=1">Show all 20',
    ),
    "show-all at depth is not a real url on this route",
  );
  assert.doesNotMatch(all, /Show all/);
  assert.doesNotMatch(capped, /<details|<summary|aria-expanded/);
});

test("rows link by kind, and a gitlink links nowhere", () => {
  const markup = treeDocument({ tree: withSubmodule });
  const submodule = rowFor(markup, "vendor");

  assert.ok(
    markup.includes(
      '<a class="nm t-item" lang="en" href="/r/linklater/blob/main/src/components/.gitignore">',
    ),
    "a file row does not link to the blob route at the current rev",
  );
  assert.ok(
    submodule.startsWith('class="row is-sub">'),
    `the gitlink row lost its class: ${submodule}`,
  );
  assert.ok(
    submodule.includes(
      '<span class="nm t-item" lang="en"><span class="sc">vendor</span></span>',
    ),
    "the gitlink name is not a plain span",
  );
  assert.ok(
    submodule.includes(
      '<span class="pin t-mono"><span class="vh">Submodule pinned at </span>9999999</span>',
    ),
    "the gitlink row lost its short sha",
  );
  assert.doesNotMatch(
    submodule,
    /<a |aria-disabled|dashed/,
    "the gitlink row grew a link or a disabled state",
  );
});

test("a directory row links to the tree route, one level down", () => {
  const markup = treeDocument({
    tree: {
      path: "src",
      entries: [
        {
          name: "components",
          oid: "1".repeat(40),
          kind: "directory",
          bytes: null,
          touched: null,
        },
      ],
    },
  });

  assert.ok(
    markup.includes(
      '<a class="nm t-item" lang="en" href="/r/linklater/tree/main/src/components">',
    ),
    "a directory row does not link to the tree route",
  );
});

test("a ref and a name that need encoding get it", () => {
  const markup = treeDocument({
    rev: "feature/tree-route",
    tree: {
      path: "src",
      entries: [
        {
          name: "a b#c.ts",
          oid: "0".repeat(40),
          kind: "file",
          bytes: 1,
          touched: null,
        },
      ],
    },
  });

  assert.ok(
    markup.includes(
      'href="/r/linklater/blob/feature%2Ftree-route/src/a%20b%23c.ts"',
    ),
    "a slash in the ref or a hash in the name reached the url raw",
  );
});

test("a tree page carries no readme and one h1", () => {
  const markup = treeDocument();

  assert.strictEqual([...markup.matchAll(/<h1[ >]/g)].length, 1);
  assert.ok(
    markup.includes('<h1 class="t-label" lang="en">src/components</h1>'),
    "the heading is not the path",
  );
  assert.doesNotMatch(
    markup,
    /<div class="readme">/,
    "a tree page rendered a readme; /r/:repo is the only page that does",
  );
  assert.ok(
    markup.includes("<title>src/components · linklater · Càrn</title>"),
  );
});

// a blob path asked for as a tree comes back as nothing above, and the
// handler turns nothing into a 404. the way that quietly becomes a 302 is
// somebody adding a redirect to the page routes, so pin their absence
test("no page route redirects", () => {
  const source = readFileSync(join(root, "src/routes/repo-page.ts"), "utf8");

  assert.doesNotMatch(
    source,
    /\.redirect\(|code\(30\d\)/,
    "a page route grew a redirect; a path that is not a tree is a 404",
  );
});

test("a tree page stays inside the weight budget", () => {
  const heaviest = widePage(20, true);

  assert.ok(
    pageWireBytes(heaviest) <= budgetBytes,
    `a tree page weighs ${pageWireBytes(heaviest)} wire bytes against a ${budgetBytes} budget`,
  );
});

// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { chromium } from "playwright";

import { stylesheet } from "../../src/html/styles.js";
import {
  type Header,
  type HeaderImage,
  headerMarkup,
  maxHeaderBytes,
  resolveHeader,
} from "../../src/repos/header.js";

const dir = mkdtempSync(join(tmpdir(), "carn-header-"));
const realGit = execFileSync("sh", ["-c", "command -v git"], {
  encoding: "utf8",
}).trim();

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function commit(files: Record<string, string | number>, links: string[] = []) {
  const work = mkdtempSync(join(dir, "work-"));

  execFileSync("git", ["init", "-q", "-b", "main", "--", work]);

  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(work, path, ".."), { recursive: true });
    writeFileSync(
      join(work, path),
      typeof body === "number" ? "z".repeat(body) : body,
    );
  }

  for (const path of links) {
    mkdirSync(join(work, path, ".."), { recursive: true });
    symlinkSync("elsewhere.svg", join(work, path));
  }

  execFileSync("git", ["-C", work, "add", "-A"]);
  execFileSync(
    "git",
    [
      "-C",
      work,
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=t",
      "commit",
      "-qm",
      "x",
    ],
    { env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } },
  );

  const oid = execFileSync("git", ["-C", work, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

  return { repoPath: work, commit: oid };
}

const src = (image: HeaderImage) => `/blob/${image.oid}/${image.path}`;
const markup = (header: Header) =>
  headerMarkup({ name: "linklater", header, src }).value;

const wordmarkOnly: Header = { light: "wordmark", dark: "wordmark" };
const shared: HeaderImage = {
  path: ".carn/header.svg",
  oid: "a".repeat(40),
  bytes: 10,
};
const dark: HeaderImage = {
  path: ".carn/header-dark.svg",
  oid: "b".repeat(40),
  bytes: 10,
};

test("an empty repo resolves to the wordmark without touching git", async () => {
  assert.deepStrictEqual(
    await resolveHeader({ repoPath: "/nonexistent", commit: null }),
    wordmarkOnly,
  );
});

test("a repo with no .carn falls through to the wordmark", async () => {
  const repo = commit({ "README.md": "hi" });

  assert.deepStrictEqual(await resolveHeader(repo), wordmarkOnly);
});

test("each slot walks its own chain, and its own slot wins", async () => {
  const repo = commit({
    ".carn/header-dark.svg": "d",
    ".carn/header.svg": "g",
    ".carn/header.png": "ignored",
  });

  const header = await resolveHeader(repo);

  assert.strictEqual(
    header.dark === "wordmark" ? null : header.dark.path,
    ".carn/header-dark.svg",
  );
  assert.strictEqual(
    header.light === "wordmark" ? null : header.light.path,
    ".carn/header.svg",
  );
});

test("a png in the slot is not a header, so the mark stands in", async () => {
  const repo = commit({
    ".carn/header.png": "g",
    ".carn/header-dark.png": "d",
  });

  assert.deepStrictEqual(await resolveHeader(repo), wordmarkOnly);
});

test("a dark-only header leaves light on the wordmark", async () => {
  const repo = commit({ ".carn/header-dark.svg": "d" });
  const header = await resolveHeader(repo);

  assert.strictEqual(header.light, "wordmark");
  assert.strictEqual(
    header.dark === "wordmark" ? null : header.dark.path,
    ".carn/header-dark.svg",
  );
});

test("an oversize image is ignored and the chain continues", async () => {
  const repo = commit({
    ".carn/header-light.svg": maxHeaderBytes + 1,
    ".carn/header.svg": "g",
  });

  const header = await resolveHeader(repo);

  assert.strictEqual(
    header.light === "wordmark" ? null : header.light.path,
    ".carn/header.svg",
  );
});

test("an image exactly at the cap is kept", async () => {
  const repo = commit({ ".carn/header.svg": maxHeaderBytes });
  const header = await resolveHeader(repo);

  assert.strictEqual(
    header.light === "wordmark" ? null : header.light.bytes,
    maxHeaderBytes,
  );
});

test("an oversize image with nothing behind it falls to the wordmark", async () => {
  const repo = commit({ ".carn/header.svg": maxHeaderBytes + 1 });

  assert.deepStrictEqual(await resolveHeader(repo), wordmarkOnly);
});

test("a symlink and a subtree are not headers", async () => {
  const repo = commit({ ".carn/header-dark.svg/keep": "x" }, [
    ".carn/header.svg",
  ]);

  assert.deepStrictEqual(await resolveHeader(repo), wordmarkOnly);
});

test("a ref that is not an object id is refused", async () => {
  const repo = commit({ ".carn/header.svg": "g" });

  for (const bad of ["--upload-pack=x", "-main", "HEAD", "main", ""]) {
    await assert.rejects(
      resolveHeader({ repoPath: repo.repoPath, commit: bad }),
      /needs an object id/,
      bad,
    );
  }
});

test("resolution spawns git once, and not again once cached", async () => {
  const repo = commit({ ".carn/header.svg": "g" });
  const shim = mkdtempSync(join(dir, "shim-"));
  const log = join(shim, "calls");
  const originalPath = process.env.PATH;

  writeFileSync(
    join(shim, "git"),
    `#!/bin/sh\necho call >> ${log}\nexec ${realGit} "$@"\n`,
  );
  chmodSync(join(shim, "git"), 0o755);
  writeFileSync(log, "");

  process.env.PATH = `${shim}:${originalPath ?? ""}`;

  const calls = () =>
    readFileSync(log, "utf8").split("\n").filter(Boolean).length;

  try {
    await resolveHeader(repo);
    const cold = calls();

    await resolveHeader(repo);
    await resolveHeader(repo);
    const warm = calls();

    assert.strictEqual(cold, 1, "a cold resolution is one ls-tree");
    assert.strictEqual(warm, 1, "a cached resolution spawned git again");
  } finally {
    process.env.PATH = originalPath;
  }
});

test("one shared source is a plain img", () => {
  const out = markup({ light: shared, dark: shared });

  assert.ok(!out.includes("<picture"), out);
  assert.strictEqual((out.match(/<img /g) ?? []).length, 1);
});

test("two committed images is a picture", () => {
  const out = markup({ light: shared, dark });

  assert.match(out, /<picture>/);
  assert.match(out, /media="\(prefers-color-scheme: dark\)"/);
  assert.match(out, /<source srcset="[^"]*header-dark\.svg"/);
  assert.match(out, /<img class="hdr" src="[^"]*header\.svg"/);
});

test("a wordmark in one slot swaps in CSS, not picture", () => {
  const out = markup({ light: "wordmark", dark });

  assert.ok(!out.includes("<picture"), out);
  assert.match(out, /<span class="hdr-light"><svg class="mark"/);
  assert.match(out, /<span class="hdr-dark"><img class="hdr"/);
});

test("both slots on the wordmark is one mark", () => {
  const out = markup(wordmarkOnly);

  assert.ok(!out.includes("hdr-light"), out);
  assert.strictEqual((out.match(/<svg /g) ?? []).length, 1);
});

test("both render paths resolve per colour scheme", {
  timeout: 60_000,
}, async () => {
  const tint = (fill: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="1"><rect width="4" height="1" fill="${fill}"/></svg>`)}`;

  const paint = (image: HeaderImage) =>
    tint(image.path.includes("dark") ? "black" : "white");

  const shell = (body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>H</title><style>${stylesheet}</style></head><body>${body}</body></html>`;

  const twoImages = headerMarkup({
    name: "linklater",
    header: { light: shared, dark },
    src: paint,
  }).value;

  const swapped = headerMarkup({
    name: "linklater",
    header: { light: "wordmark", dark },
    src: paint,
  }).value;

  const browser = await chromium.launch();

  try {
    for (const scheme of ["light", "dark"] as const) {
      const page = await browser.newPage({ colorScheme: scheme });

      await page.setContent(shell(`<div id="a">${twoImages}</div>`));
      await page.waitForFunction(
        () => (document.querySelector("#a img") as HTMLImageElement).complete,
      );
      const chosen = await page.evaluate(
        () => (document.querySelector("#a img") as HTMLImageElement).currentSrc,
      );

      assert.strictEqual(
        chosen,
        tint(scheme === "dark" ? "black" : "white"),
        `picture picked the wrong source under ${scheme}`,
      );

      await page.setContent(shell(`<div id="b">${swapped}</div>`));
      const visible = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#b > span"))
          .filter((node) => getComputedStyle(node).display !== "none")
          .map((node) => node.className),
      );

      assert.deepStrictEqual(
        visible,
        [scheme === "dark" ? "hdr-dark" : "hdr-light"],
        `the CSS swap showed the wrong slot under ${scheme}`,
      );

      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("a header image carries an empty alt, never a missing one", () => {
  for (const out of [
    markup({ light: shared, dark: shared }),
    markup({ light: shared, dark }),
    markup({ light: "wordmark", dark }),
  ]) {
    for (const tag of out.match(/<img [^>]*>/g) ?? []) {
      assert.match(tag, /alt=""/, tag);
    }
  }
});

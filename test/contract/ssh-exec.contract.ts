// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The command strings below were captured from git 2.50.1 itself, by
// pointing GIT_SSH_COMMAND at a script that logged its argv. They are
// transcriptions of real wire traffic, not guesses at its shape.

import assert from "node:assert";
import { test } from "node:test";

// nothing below queries; exec.ts only has to clear config.ts's fail-fast
process.env.DATABASE_URL ??= "postgresql://unused/unused";

const { parseCommand, refusals } = await import("../../src/ssh/exec.js");

const captured: [string, string, string][] = [
  ["ssh://git@h:2222/myrepo", "git-upload-pack '/myrepo'", "/myrepo"],
  [
    "ssh://git@h:2222/myrepo.git",
    "git-upload-pack '/myrepo.git'",
    "/myrepo.git",
  ],
  ["git@h:myrepo", "git-upload-pack 'myrepo'", "myrepo"],
  ["ssh://git@h/a b", "git-upload-pack '/a b'", "/a b"],
];

const capturedPush: [string, string, string][] = [
  ["ssh://git@h:2222/mine.git", "git-receive-pack '/mine.git'", "/mine.git"],
  ["git@h:mine", "git-receive-pack 'mine'", "mine"],
];

test("every captured upload-pack command parses to its path", () => {
  for (const [url, command, target] of captured) {
    assert.deepStrictEqual(
      parseCommand(command),
      { service: "upload-pack", target },
      `${url} sent ${command}`,
    );
  }
});

test("every captured receive-pack command parses to its path", () => {
  for (const [url, command, target] of capturedPush) {
    assert.deepStrictEqual(
      parseCommand(command),
      { service: "receive-pack", target },
      `${url} sent ${command}`,
    );
  }
});

test("git's sq-escaped forms do not parse", () => {
  // sq_quote_buf escapes ' and !, neither of which a repo name may hold
  assert.strictEqual(parseCommand(`git-upload-pack '/it'\\''s'`), null);
  assert.strictEqual(parseCommand(`git-upload-pack '/a'\\!'b'`), null);
});

test("anything that is not one of the two services does not parse", () => {
  for (const command of [
    "id",
    "",
    "git upload-pack '/x'",
    "git-upload-pack '/x'; rm -rf /",
    "git-upload-pack '/x' '/y'",
    "git-upload-pack /x",
    "git-archive '/x'",
    "GIT-UPLOAD-PACK '/x'",
    "git-upload-pack  '/x'",
    "\ngit-upload-pack '/x'",
    "git-upload-pack '/x'\n",
  ]) {
    assert.strictEqual(
      parseCommand(command),
      null,
      `${JSON.stringify(command)} parsed`,
    );
  }
});

test("a traversal attempt parses, then fails the name format", () => {
  // the parser's job is the wire shape; resolveRepo owns the name rule
  assert.deepStrictEqual(parseCommand("git-upload-pack '/../etc'"), {
    service: "upload-pack",
    target: "/../etc",
  });
});

test("the refusals say what happened and what to do, in the house voice", () => {
  const lines = [
    refusals.badCommand,
    refusals.badName,
    refusals.noRepo("demo"),
    refusals.noWrite("demo"),
    refusals.unavailable,
  ];

  for (const line of lines) {
    assert.doesNotMatch(line, /[!]|\.\.\.|sorry|oops|apolog/i, line);
    assert.strictEqual(line.includes("\n"), false, `${line} spans lines`);
  }

  assert.match(refusals.noWrite("demo"), /write access to demo/);
  assert.match(refusals.noRepo("demo"), /no repo named demo/);
});

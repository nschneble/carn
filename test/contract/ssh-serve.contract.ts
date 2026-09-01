// SPDX-License-Identifier: AGPL-3.0-or-later

// abandoned clone chain: channel close event aborts the controller serve()
// hands to spawnGit, which SIGKILLs the child; lose it and orphaned git
// processes hold semaphore slots 'til they timeout + the box stops serving

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Duplex, PassThrough } from "node:stream";
import { after, test } from "node:test";
import type { ServerChannel } from "ssh2";

import type { ResolvedRepo } from "../../src/repos/resolve.js";
import type { ExecRequest, ParsedCommand } from "../../src/ssh/exec.js";

// nothing below queries; exec.ts only has to clear config.ts's fail-fast
process.env.DATABASE_URL ??= "postgresql://unused/unused";

const { serve } = await import("../../src/ssh/exec.js");

const dir = mkdtempSync(join(tmpdir(), "carn-ssh-serve-"));
const repoPath = join(dir, "pinned.git");
execFileSync("git", ["init", "--bare", "-q", "--", repoPath]);

const channels: FakeChannel[] = [];
after(() => {
  // a lost listener leaves git alive: give it stdin EOF so a failing run
  // reports and exits instead of idling out serve's 10-minute timeout
  for (const channel of channels) {
    channel.push(null);
  }

  rmSync(dir, { recursive: true, force: true });
});

const owner = "66666666-6666-4666-8666-666666666666";
const repo: ResolvedRepo = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "pinned",
  ownerId: owner,
  defaultBranch: "main",
  path: repoPath,
};

const parsed: ParsedCommand = { service: "upload-pack", target: "pinned" };

const bounded = { timeout: 10_000 };
const timeoutMs = 5_000;

// a PassThrough would loop the child's own advertisement back into its
// stdin, since serve() both writes to the channel and pipes from it
class FakeChannel extends Duplex {
  readonly stderr = new PassThrough();
  exitCode: number | null = null;

  // never pushes and never ends, so upload-pack blocks reading stdin
  _read(): void {}

  _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.emit("advertised", chunk);
    done();
  }

  exit(code: number): boolean {
    this.exitCode = code;
    return true;
  }

  // ssh2 ends the channel before it emits, which is what makes finish()
  // skip exit(); the read side stays open so only the kill ends the child
  close(): void {
    this.end();
    this.emit("close");
  }
}

test("closing the channel kills the git child", bounded, async () => {
  const channel = new FakeChannel();
  channel.stderr.resume();
  channels.push(channel);

  const request: ExecRequest = {
    channel: channel as unknown as ServerChannel,
    command: "git-upload-pack 'pinned'",
    userId: owner,
  };

  const served = serve(request, parsed, repo);

  try {
    const [chunk] = await once(channel, "advertised", {
      signal: AbortSignal.timeout(timeoutMs),
    });

    assert.match(String(chunk), /^[0-9a-f]{4}/, "not a git pkt-line");
  } finally {
    channel.close();
  }

  // done settles on the child's close event, which trails the process
  // ending; a survivor would hold this open for the full 10-min timeout
  await served;

  assert.strictEqual(channel.exitCode, null, "finish() exited a gone channel");
});

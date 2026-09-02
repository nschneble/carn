// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import { age } from "../../src/html/age.js";
import { smallCaps } from "../../src/html/filename.js";
import { repoListPage } from "../../src/html/repo-list.js";
import { styleHref, stylesheet } from "../../src/html/styles.js";
import type { RepoSummary } from "../../src/repos/list.js";
import { sshRemote } from "../../src/repos/remote.js";
import { frozen, indexDocument, populated } from "../gallery/repo-index.js";

const rowPattern = /<li class="row(?: [a-z-]+)?">/g;

function rows(markup: string): number {
  return [...markup.matchAll(rowPattern)].length;
}

function stub(count: number): RepoSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `repo-${index}`,
    description: null,
    createdAt: frozen,
  }));
}

test("the shell is one header, one main, and one footer", () => {
  const markup = indexDocument();

  assert.match(markup, /^<!doctype html>\n<html lang="en">\n/);
  assert.match(
    markup,
    /<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" \/>/,
  );
  assert.doesNotMatch(markup, /maximum-scale|user-scalable/);
  assert.ok(markup.includes("<title>Càrn</title>"));
  assert.ok(markup.includes(`<link rel="stylesheet" href="${styleHref}" />`));

  const outside = markup
    .slice(
      markup.indexOf("<body>") + "<body>".length,
      markup.indexOf("</body>"),
    )
    .replace(/<header>[\s\S]*<\/footer>/, "")
    .trim();
  assert.strictEqual(
    outside,
    "",
    "content sits outside the three landmarks, which is what axe's region rule reports",
  );

  for (const landmark of ["header", "main", "footer"]) {
    assert.strictEqual(
      [...markup.matchAll(new RegExp(`<${landmark}[ >]`, "g"))].length,
      1,
      `there is not exactly one <${landmark}>`,
    );
  }

  assert.ok(markup.includes('<main id="main" tabindex="-1">'));
  assert.doesNotMatch(markup, /<nav[ >]/);
});

test("the skip link is the first focusable thing on the page", () => {
  const markup = indexDocument();
  const first = markup.indexOf(
    '<a class="skip" href="#main">Skip to content</a>',
  );

  assert.notStrictEqual(first, -1, "the skip link is missing");
  assert.strictEqual(
    markup.search(/<(?:a|button|input|select|textarea)[ >]/),
    first,
    "something focusable precedes the skip link",
  );
  assert.ok(
    markup.indexOf("<header>") < first && first < markup.indexOf("</header>"),
    "the skip link is not inside the header",
  );
});

test("one h1, the list's own label, and no other heading", () => {
  const markup = indexDocument();

  assert.ok(
    markup.includes('<h1 class="t-item t-item--title">Repositories</h1>'),
  );
  assert.strictEqual([...markup.matchAll(/<h[1-6][ >]/g)].length, 1);
  assert.doesNotMatch(markup, /class="[^"]*t-xl/);
});

test("the index lists every repo, with no cap and no show-all", () => {
  for (const count of [0, 1, 16, 17, 40, 200]) {
    const markup = repoListPage({
      repos: stub(count),
      now: frozen,
    });

    assert.strictEqual(
      rows(markup),
      count,
      `${count} repos rendered ${rows(markup)} rows`,
    );
  }

  const many = repoListPage({ repos: stub(40), now: frozen });
  assert.doesNotMatch(many, /Show all/i);
  assert.doesNotMatch(many, /aria-expanded|<details|<summary/);
});

test("a row is an anchored name, a description slot, and a datetime", () => {
  const markup = indexDocument();

  assert.ok(markup.includes('<ul class="repos" role="list">'));
  assert.ok(
    markup.includes(
      `<a class="nm t-item" lang="en" href="/r/linklater">${smallCaps("linklater").value}</a>`,
    ),
  );

  const noDescription = populated.find((repo) => repo.description === null);
  assert.ok(noDescription, "the fixture lost its repo with no description");
  assert.match(
    markup,
    new RegExp(
      `<a class="nm t-item" lang="en" href="/r/${noDescription.name}">${smallCaps(noDescription.name).value}</a>\\s*<span class="msg"></span>`,
    ),
    "a repo with no description dropped its .msg span, so the grid columns no longer line up",
  );

  assert.strictEqual(
    [...markup.matchAll(/<span class="msg">/g)].length,
    populated.length,
  );
  assert.ok(
    markup.includes(
      '<span class="vh">Created </span><time datetime="2026-05-11T08:30:00.000Z">15w</time>',
    ),
  );
});

test("a repo name wears the caps wrapper like every other Row, and no tooltip", () => {
  const markup = indexDocument();

  assert.match(markup, /class="caps"/);
  assert.doesNotMatch(markup, /class="nm t-item"[^>]*title=/);
  assert.doesNotMatch(markup, /class="[^"]*is-dir/);
});

test("a description is escaped, never interpolated raw", () => {
  const markup = indexDocument();

  assert.ok(
    markup.includes(
      '<span class="msg">The blob origin. &quot;Say &lt;what&gt; it does&quot; &amp; why.</span>',
    ),
  );
  assert.doesNotMatch(markup, /<span class="msg">[^<]*<(?!\/span)/);
});

test("the empty state says what would be here and how to make one", () => {
  const markup = indexDocument({ repos: [] });

  assert.strictEqual(rows(markup), 0);
  assert.ok(
    markup.includes('<h1 class="t-item t-item--title">Repositories</h1>'),
  );
  assert.ok(markup.includes("<footer>"));
  assert.ok(
    markup.includes(
      `<code class="t-mono">git push ${sshRemote("your-repo")} main</code>`,
    ),
    "the empty state's command does not come from config",
  );
  assert.doesNotMatch(markup, /<pre[ >]/);

  const start = markup.indexOf('<div class="empty">');
  assert.notStrictEqual(start, -1, "the empty state is missing");
  const copy = markup.slice(start, markup.indexOf("</div>", start));

  assert.ok(copy.includes("No repos yet."));
  assert.ok(copy.includes("pushing to a name that doesn't exist creates it"));
  assert.doesNotMatch(copy, /[!…]|Oops/);
});

// the palette is the reader's system preference and nothing else, so the
// root element carries no state at all and the page is one set of bytes
test("the root element carries nothing but its language", () => {
  for (const repos of [populated, []]) {
    const markup = indexDocument({ repos });
    const root = markup.slice(
      markup.indexOf("<html"),
      markup.indexOf(">", markup.indexOf("<html")) + 1,
    );

    assert.strictEqual(root, '<html lang="en">');
  }

  assert.doesNotMatch(stylesheet, /data-theme/);
});

test("no page carries script, an inline style, or a style attribute", () => {
  for (const repos of [populated, []]) {
    const markup = indexDocument({ repos });

    assert.doesNotMatch(markup, /<script/i);
    assert.doesNotMatch(markup, /<style[ >]/i);
    assert.doesNotMatch(markup, / style=/i);
    assert.doesNotMatch(markup, /\son[a-z]+=/i);
  }
});

test("an age reads in the largest unit that fits, in both directions", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const ago = (ms: number) => age(new Date(now.getTime() - ms), now);

  assert.strictEqual(ago(0), "now");
  assert.strictEqual(ago(59_000), "now");
  assert.strictEqual(ago(60_000), "1m");
  assert.strictEqual(ago(59 * 60_000), "59m");
  assert.strictEqual(ago(60 * 60_000), "1h");
  assert.strictEqual(ago(23 * 3_600_000), "23h");
  assert.strictEqual(ago(24 * 3_600_000), "1d");
  assert.strictEqual(ago(6 * 86_400_000), "6d");
  assert.strictEqual(ago(7 * 86_400_000), "1w");
  assert.strictEqual(ago(364 * 86_400_000), "52w");
  assert.strictEqual(ago(365 * 86_400_000), "1y");
  assert.strictEqual(ago(900 * 86_400_000), "2y");
  assert.strictEqual(
    ago(-86_400_000),
    "now",
    "a clock skew must not read as a negative age",
  );
});

test("the ssh remote drops its port only when git owns 22", () => {
  const remote = sshRemote("linklater");

  assert.match(
    remote,
    /^(?:git@[^:]+:linklater|ssh:\/\/git@[^/]+\/linklater)$/,
  );
  assert.ok(
    remote.endsWith("linklater"),
    "the remote no longer names the repo last, so it is not a push target",
  );
});

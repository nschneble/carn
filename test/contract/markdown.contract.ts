// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import MarkdownIt from "markdown-it";

import { buildApp } from "../../src/app.js";
import { html, type Raw } from "../../src/html/index.js";
import { renderMarkdown } from "../../src/markdown/render.js";
import {
  type Interpolation,
  lineOf,
  root,
  scan,
  scanIn,
  substitution,
  template,
  templateSources,
} from "../support/html-position.js";

const fixture = "test/fixtures/markdown-raw-position.ts.fixture";

const stock = new MarkdownIt("commonmark", { html: false }).enable("table");

const allowedSchemes = [
  "https://example.com/a",
  "http://example.com/a",
  "mailto:nick@example.com",
  "data:image/gif;base64,AAA",
  "data:image/png;base64,AAA",
  "data:image/jpeg;base64,AAA",
  "data:image/webp;base64,AAA",
];

const allowedWithoutScheme = ["docs/BRAND.md", "#section", "?ref=main"];

const deniedSchemes = [
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "data:text/html;base64,AAA",
  "data:image/svg+xml;base64,AAA",
  "ftp://example.com/f",
  "blob:https://example.com/x",
  "about:blank",
  "//example.com/x",
];

const bearsMarkdown = /\braw\(|\brenderMarkdown\(/;

function link(destination: string): string {
  return renderMarkdown(`[x](${destination})`).value;
}

function href(markup: string): string | null {
  return /<a href="([^"]*)"/.exec(markup)?.[1] ?? null;
}

function rel(markup: string): string | null {
  return /<a [^>]*\brel="([^"]*)"/.exec(markup)?.[1] ?? null;
}

const externalForms: [string, string][] = [
  ["inline", "[x](https://example.com/a)"],
  ["autolink", "<https://example.com/a>"],
  ["reference", "[x][r]\n\n[r]: https://example.com/a"],
  ["http", "[x](http://example.com/a)"],
  ["uppercase scheme", "[x](HTTPS://example.com/a)"],
];

const localForms: [string, string][] = [
  ["relative", "[x](docs/BRAND.md)"],
  ["root-relative", "[x](/r/carn)"],
  ["anchor", "[x](#section)"],
  ["query", "[x](?ref=main)"],
  ["mailto", "[x](mailto:nick@example.com)"],
];

function misplaced(source: string): Interpolation[] {
  return scan(source).filter(
    (found) =>
      bearsMarkdown.test(substitution(source, found)) &&
      found.position !== "text",
  );
}

test("the configuration is commonmark with html off", () => {
  const out = renderMarkdown("<b>bold</b> & <i>italic</i>\n").value;

  assert.strictEqual(
    out,
    "<p>&lt;b&gt;bold&lt;/b&gt; &amp; &lt;i&gt;italic&lt;/i&gt;</p>\n",
  );
});

test("table is enabled and nothing else beyond commonmark is", () => {
  const table = renderMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |\n").value;
  assert.ok(table.startsWith("<table>"), table);
  assert.ok(table.includes("<th>a</th>"), table);

  const off = renderMarkdown("~~struck~~ and http://bare.example/x\n").value;
  assert.strictEqual(off, "<p>~~struck~~ and http://bare.example/x</p>\n");

  const fenced = renderMarkdown("```js\nconst a = 1;\n```\n").value;
  assert.ok(fenced.includes('<code class="language-js">'), fenced);
});

test("the allowlist denies a scheme markdown-it's own default allows", () => {
  const ours = link("ftp://example.com/f");
  const theirs = stock.render("[x](ftp://example.com/f)");

  assert.strictEqual(
    href(theirs),
    "ftp://example.com/f",
    "the stock instance stopped allowing ftp:, so it no longer discriminates between the default blocklist and the allowlist — find another scheme the default allows",
  );
  assert.strictEqual(href(ours), null, ours);
  assert.strictEqual(ours, "<p>[x](ftp://example.com/f)</p>\n");
});

test("a javascript: payload alone cannot prove the allowlist", () => {
  assert.strictEqual(
    href(stock.render("[x](javascript:alert(1))")),
    null,
    "markdown-it's default validateLink is a four-scheme blocklist and already rejects javascript:, which is why the ftp: comparison above is the test that can fail",
  );
  assert.strictEqual(href(link("javascript:alert(1)")), null);
});

test("every allowed destination renders a working link", () => {
  for (const destination of [...allowedSchemes, ...allowedWithoutScheme]) {
    assert.strictEqual(href(link(destination)), destination, destination);
  }
});

test("every denied destination renders no link at all", () => {
  for (const destination of deniedSchemes) {
    const out = link(destination);
    assert.strictEqual(href(out), null, out);
    assert.ok(!out.includes("<a "), out);
  }
});

test("an image destination is held to the same allowlist", () => {
  const png = renderMarkdown("![a](data:image/png;base64,AAA)").value;
  const svg = renderMarkdown("![a](data:image/svg+xml;base64,AAA)").value;

  assert.strictEqual(
    png,
    '<p><img src="data:image/png;base64,AAA" alt="a" /></p>\n',
  );
  assert.strictEqual(svg, "<p>![a](data:image/svg+xml;base64,AAA)</p>\n");
});

test("an external link carries the rel, in all three link forms", () => {
  for (const [form, source] of externalForms) {
    const out = renderMarkdown(source).value;
    assert.strictEqual(rel(out), "nofollow ugc", `${form}: ${out}`);
  }
});

test("a link that is not external carries no rel at all", () => {
  for (const [form, source] of localForms) {
    const out = renderMarkdown(source).value;

    assert.ok(out.includes("<a href="), `${form} rendered no link: ${out}`);
    assert.strictEqual(rel(out), null, `${form}: ${out}`);
    assert.ok(!out.includes("nofollow"), `${form}: ${out}`);
  }
});

test("the rel rule renders through a fallback, keeping other attributes", () => {
  assert.strictEqual(
    stock.renderer.rules.link_open,
    undefined,
    "link_open gained a default rule, so the renderToken fallback is no longer the branch that runs — re-derive which one does before trusting the rel rule",
  );

  const titled = renderMarkdown('[x](https://example.com/a "t")').value;

  assert.strictEqual(
    titled,
    '<p><a href="https://example.com/a" title="t" rel="nofollow ugc">x</a></p>\n',
  );
});

test("a remote image survives the markdown layer for CSP to stop", async () => {
  const out = renderMarkdown("![a](https://example.com/x.png)").value;

  assert.strictEqual(
    out,
    '<p><img src="https://example.com/x.png" alt="a" /></p>\n',
  );

  const app = buildApp();
  const response = await app.inject({ method: "GET", url: "/health" });
  await app.close();

  assert.strictEqual(
    response.headers["content-security-policy"],
    "default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
});

test("the data-image branch is anchored to the start of the url", () => {
  const evasions = [
    "javascript:alert(1)#data:image/gif;x",
    "javascript:alert(1)?data:image/png;",
    " vbscript:x#data:image/webp;",
  ];

  for (const destination of evasions) {
    const out = link(destination);
    const image = renderMarkdown(`![a](${destination})`).value;

    assert.strictEqual(href(out), null, out);
    assert.ok(!image.includes("<img"), image);
  }
});

test("an entity-encoded scheme is decoded before the allowlist sees it", () => {
  const encoded = link("java&#115;cript:alert(1)");

  assert.strictEqual(href(encoded), null, encoded);
  assert.strictEqual(encoded, "<p>[x](javascript:alert(1))</p>\n");
});

test("a readme carrying three payloads renders inert", () => {
  const readme = [
    "# Readme",
    "",
    "<script>alert(1)</script>",
    "",
    "[click](javascript:alert(1))",
    "",
    '<img src=x onerror="alert(1)">',
    "",
  ].join("\n");

  const out = renderMarkdown(readme).value;

  assert.strictEqual(
    out,
    [
      "<h1>Readme</h1>",
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
      "<p>[click](javascript:alert(1))</p>",
      "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>",
      "",
    ].join("\n"),
  );

  assert.ok(!/<script/i.test(out), out);
  assert.ok(!/<img/i.test(out), out);
  assert.ok(!/href\s*=/i.test(out), out);
  assert.ok(!/\son\w+\s*=\s*"/i.test(out), out);
});

test("the rendered fragment is text, and the html tag leaves it alone", () => {
  const rendered = renderMarkdown("*hi* & <b>x</b>\n");
  const page = html`<article>${rendered}</article>`.value;

  assert.strictEqual(
    page,
    "<article><p><em>hi</em> &amp; &lt;b&gt;x&lt;/b&gt;</p>\n</article>",
  );
});

test("rendered markdown outside text position is a violation", () => {
  const safe = template(`<article>\${renderMarkdown(readme)}</article>`);
  assert.deepStrictEqual(misplaced(safe), []);

  const planted: [string, string][] = [
    [`<article data-x="\${renderMarkdown(readme)}"></article>`, "doubleQuoted"],
    [`<article data-x='\${raw(readme)}'></article>`, "singleQuoted"],
    [`<article title=\${renderMarkdown(readme)}></article>`, "beforeAttrValue"],
    [`<article title=r-\${renderMarkdown(readme)}></article>`, "unquoted"],
  ];

  for (const [markup, position] of planted) {
    const source = template(markup);

    assert.deepStrictEqual(
      misplaced(source).map((found) => found.position),
      [position],
      markup,
    );
  }
});

test("rendered markdown in an attribute is refused at render time", () => {
  const readme = "# hi\n";
  const value = renderMarkdown(readme);
  const aliased = renderMarkdown;

  function readmeBody(source: string): Raw {
    return renderMarkdown(source);
  }

  const shapes: [string, unknown][] = [
    ["direct", renderMarkdown(readme)],
    ["intermediate const", value],
    ["aliased function", aliased(readme)],
    ["point-free map", [readme].map(aliased)],
    ["wrapper component", readmeBody(readme)],
  ];

  for (const [shape, carried] of shapes) {
    assert.throws(
      () => html`<article data-readme="${carried}"></article>`,
      /raw value in doubleQuoted position/,
      shape,
    );
    assert.doesNotThrow(() => html`<article>${carried}</article>`, shape);
  }
});

test("the lexical scan sees only the shape written literally", () => {
  const direct = template(`<a title="\${renderMarkdown(readme)}"></a>`);
  const wrapped = template(`<a title="\${readmeBody(readme)}"></a>`);

  assert.deepStrictEqual(
    misplaced(direct).map((found) => found.position),
    ["doubleQuoted"],
  );
  assert.deepStrictEqual(
    misplaced(wrapped),
    [],
    "the scanner started matching an indirect shape, so the render-time refusal is no longer the only thing covering it — widen this test rather than delete it",
  );
});

test("the planted fixture is caught", () => {
  const source = readFileSync(join(root, fixture), "utf8");

  assert.deepStrictEqual(
    misplaced(source).map((found) => found.position),
    ["doubleQuoted", "singleQuoted", "beforeAttrValue"],
  );

  const bearing = scan(source).filter((found) =>
    bearsMarkdown.test(substitution(source, found)),
  );

  assert.strictEqual(bearing.length, 4);
});

test("no rendered markdown lands in an attribute position", () => {
  const files = templateSources();
  const reported: string[] = [];
  const bearing: string[] = [];

  let classified = 0;

  for (const file of files) {
    for (const found of scanIn(file)) {
      classified += 1;
      if (!bearsMarkdown.test(substitution(file.source, found))) continue;
      bearing.push(file.path);
      if (found.position === "text") continue;
      reported.push(
        `${file.path}:${lineOf(file.source, found.index)} ${found.position}`,
      );
    }
  }

  assert.ok(files.length > 0, "found no template source to check");
  assert.ok(classified > 0, "found no interpolations to classify");
  assert.deepStrictEqual(reported, []);
  assert.deepStrictEqual(
    [...new Set(bearing)].sort(),
    ["src/html/repo-show.ts", "test/contract/escaping.contract.ts"],
    "the set of files interpolating raw() or renderMarkdown() changed. src/html/repo-show.ts is the repo page, and it is the only src/ file that may — this list is what stops the sweep going blind. Add a new file deliberately",
  );
});

test("one configured instance serves the whole repo", () => {
  const listed = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "-c",
      "-o",
      "--exclude-standard",
      "--",
      "src",
      "test",
      "scripts",
    ],
    { cwd: root, encoding: "utf8" },
  );

  const carrying = listed
    .split("\0")
    .filter((path) => path !== "")
    .filter((path) =>
      readFileSync(join(root, path), "utf8").includes("new MarkdownIt("),
    );

  // scripts stays in scan: visual-server.ts serves the baselined pages
  assert.deepStrictEqual(carrying, [
    "scripts/docs-artifact.mjs",
    "src/markdown/render.ts",
    "test/contract/markdown.contract.ts",
  ]);
});

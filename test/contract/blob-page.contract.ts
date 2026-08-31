// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import {
  blobPage,
  sourceCapBytes,
  wirePerSourceByte,
} from "../../src/html/blob-page.js";
import { languageFor } from "../../src/html/syntax.js";
import {
  budgetBytes,
  pageWireBytes,
  stylesheetWireBytes,
} from "../../src/html/wire-weight.js";
import { blobAssetPath, sniffRaster } from "../../src/repos/blob-asset.js";
import { countLines } from "../../src/repos/blob-view.js";
import {
  binaryBlob,
  deniedBlob,
  frontLoadedBlob,
  hugeBlob,
  imageBlob,
  largeSource,
  pngBody,
  rasterBlob,
  rawOrigin,
  smallBlob,
  spanningBlob,
  svgBlob,
  textBlob,
} from "../gallery/blob.js";

const noticePattern = /Showing the first ([\d,]+) lines of ([\d,]+)\./;

function codeBody(markup: string): string {
  const open = markup.indexOf("<code ");
  assert.notStrictEqual(open, -1, "the page rendered no code block");

  const start = markup.indexOf(">", open) + 1;
  const end = markup.indexOf("</code>", start);
  assert.notStrictEqual(end, -1, "the code block is unterminated");

  return markup.slice(start, end);
}

// a cut through rendered html leaves a span open, which the browser
// repairs by restructuring everything after it
function spans(body: string): { opened: number; closed: number } {
  return {
    opened: (body.match(/<span[^>]*>/g) ?? []).length,
    closed: (body.match(/<\/span>/g) ?? []).length,
  };
}

function renderedLines(body: string): number {
  return (body.match(/\n/g) ?? []).length;
}

test("a file under the cap renders whole, with no notice and no hatch", () => {
  const markup = blobPage({ repo: "linklater", blob: smallBlob, rawOrigin });

  assert.doesNotMatch(markup, noticePattern);
  assert.doesNotMatch(markup, /aria-describedby/);
  assert.doesNotMatch(markup, /Show entire file/);

  assert.strictEqual(
    renderedLines(codeBody(markup)),
    smallBlob.lines,
    "the whole-file render lost lines",
  );
  assert.ok(codeBody(markup).includes("readFile"), "the source went missing");
});

test("a file over the cap is cut on a line boundary and says so", () => {
  const markup = blobPage({ repo: "linklater", blob: hugeBlob, rawOrigin });
  const notice = noticePattern.exec(markup);

  assert.ok(notice, "a truncated file rendered no notice");

  const shown = Number((notice[1] as string).replaceAll(",", ""));
  const total = Number((notice[2] as string).replaceAll(",", ""));

  assert.strictEqual(total, hugeBlob.lines);
  assert.ok(shown > 0 && shown < total, `${shown} of ${total} is not a cut`);

  assert.match(markup, /<p class="t-label" id="blob-cut">/);
  assert.match(markup, /aria-describedby="blob-cut"/);

  assert.strictEqual(
    renderedLines(codeBody(markup)),
    shown,
    "the notice counts a different number of lines than the block holds",
  );
});

test("the truncated block's markup is balanced, so nothing is repaired", () => {
  for (const blob of [smallBlob, hugeBlob]) {
    const { opened, closed } = spans(codeBody(blobPage({ repo: "a", blob })));

    assert.ok(opened > 0, `${blob.path} highlighted to no spans at all`);
    assert.strictEqual(
      opened,
      closed,
      `${blob.path} left ${opened - closed} spans open, so the source was cut after highlighting rather than before`,
    );
  }
});

// the refinement model predicts from a per-line average, so a file whose
// first line costs many times what the rest do can still be over when its
// passes run out; what ships is measured, never predicted
test("a front-loaded file never ships over a budget the model missed", () => {
  const markup = blobPage({
    repo: "linklater",
    blob: frontLoadedBlob,
    rawOrigin,
  });
  const weight = pageWireBytes(markup);

  assert.ok(
    weight <= budgetBytes,
    `the front-loaded page weighs ${weight} wire bytes against a ${budgetBytes} B budget, so the loop shipped what its last pass measured rather than something that fits`,
  );

  const notice = noticePattern.exec(markup);
  assert.ok(notice, "the front-loaded file rendered no notice");
  assert.ok(
    Number((notice[1] as string).replaceAll(",", "")) > 0,
    "the page fits only by showing nothing, which the empty state says better",
  );
});

// a minified bundle is one line, so the cap falls before the first break
// and there is no boundary to cut on
test("a file whose first line outruns the cap says so, and is not blank", () => {
  const markup = blobPage({
    repo: "linklater",
    blob: textBlob(
      "dist/bundle.js",
      `const b = "${"payload".repeat(20_000)}";\n`,
    ),
  });

  assert.doesNotMatch(
    markup,
    /<pre class="src"/,
    "the page rendered a source block with nothing in it",
  );
  assert.doesNotMatch(markup, noticePattern);
  assert.match(markup, /<div class="empty">/);
  assert.ok(
    markup.includes(
      "Text file, 136.7 KB. Its first line is longer than can be shown here.",
    ),
    "the page declined without saying what it holds or why it declined",
  );
  assert.ok(markup.includes("<dt>Lines</dt><dd>1</dd>"));
  assert.ok(markup.includes("<dt>Size</dt><dd>136.7 KB</dd>"));
});

// the decline above comes back from an empty cut. this one's first line is
// well inside the source cap and still outweighs the room the chrome
// leaves, so the shrink pass and the halving both run out on one line
test("a file the cap admits and the budget refuses declines the same way", () => {
  const view = { repo: "linklater", blob: deniedBlob };
  const first = (deniedBlob.source ?? "").split("\n")[0] ?? "";

  assert.ok(
    Buffer.byteLength(first, "utf8") < sourceCapBytes(view),
    "the first line already outruns the source cap, so this is the other decline",
  );

  const markup = blobPage(view);

  assert.doesNotMatch(
    markup,
    /<pre class="src"/,
    "the page rendered a source block with nothing in it",
  );
  assert.doesNotMatch(markup, noticePattern);
  assert.match(markup, /<div class="empty">/);
  assert.ok(
    markup.includes("Its first line is longer than can be shown here."),
    "the page went blank instead of declining",
  );
});

test("a 0-byte file reports no lines, not the one a split invents", () => {
  assert.strictEqual(countLines(""), 0);
  assert.strictEqual(countLines("one\n"), 1);
  assert.strictEqual(countLines("one\ntwo"), 2);

  const markup = blobPage({
    repo: "linklater",
    blob: textBlob("src/empty.ts", ""),
  });

  assert.ok(
    markup.includes("<dt>Lines</dt><dd>0</dd>"),
    "an empty file claimed a line it does not have",
  );
});

// every other truncation fixture closes each span on the line it opened,
// so cutting rendered markup at a line boundary would stay balanced there
test("a span opening lines before the cut still closes after it", () => {
  const body = codeBody(blobPage({ repo: "linklater", blob: spanningBlob }));
  const { opened, closed } = spans(body);

  assert.match(
    body,
    /<span class="hljs-comment">\/\*/,
    "the fixture's block comment is not one span, so the cut crosses nothing",
  );
  assert.ok(
    !body.includes("*/"),
    "the cut fell past the comment's close, so no span crosses it",
  );
  assert.ok(opened > 0, "the fixture highlighted to no spans at all");
  assert.strictEqual(
    opened,
    closed,
    `the block left ${opened - closed} spans open, so the source was cut after highlighting rather than before`,
  );
});

// the truncation notice is the only signal a reader gets at MLP, where no
// raw origin is configured and the hatch is not rendered at all
test("the notice renders whether or not a raw origin is configured", () => {
  for (const origin of [rawOrigin, undefined]) {
    const markup = blobPage({
      repo: "linklater",
      blob: hugeBlob,
      rawOrigin: origin,
    });

    assert.match(markup, noticePattern, `no notice with origin ${origin}`);
  }
});

test("the escape hatches are absent unset and point at the origin set", () => {
  const cases = [
    { blob: hugeBlob, label: "Show entire file" },
    { blob: imageBlob, label: "Open raw" },
    { blob: binaryBlob("build/carn.wasm", 9_000_000), label: "Open raw" },
  ];

  for (const { blob, label } of cases) {
    const absent = blobPage({ repo: "linklater", blob });

    assert.doesNotMatch(
      absent,
      /class="showall"/,
      `${blob.path} linked anyway`,
    );
    assert.ok(!absent.includes(label), `${blob.path} kept the ${label} copy`);
    assert.doesNotMatch(
      absent,
      /aria-disabled/,
      `${blob.path} disabled the hatch instead of dropping it`,
    );

    const present = blobPage({ repo: "linklater", blob, rawOrigin });
    const href = `${rawOrigin}/linklater/${blob.rev}/${blob.path}`;

    assert.ok(present.includes(label), `${blob.path} lost the ${label} copy`);
    assert.ok(
      present.includes(`href="${href}"`),
      `${blob.path} pointed somewhere other than ${href}`,
    );
    assert.doesNotMatch(present, /target="_blank"/);
    assert.ok(
      present.includes(`<span class="vh"> · ${blob.path}</span>`),
      `${blob.path} lost the link-purpose suffix`,
    );
  }
});

test("the cap is computed from the budget, so a bigger sheet shrinks it", () => {
  const view = { repo: "linklater", blob: hugeBlob };
  const base = sourceCapBytes(view);
  const grown = sourceCapBytes({ ...view, sheetWire: 8_000 });
  const shrunk = sourceCapBytes({ ...view, sheetWire: 200 });

  assert.ok(base > 0, "the cap computed to nothing");
  assert.ok(
    grown < base,
    `a stylesheet 8000 wire bytes long left the cap at ${grown}, not below ${base}`,
  );
  assert.ok(
    shrunk > base,
    `a smaller stylesheet left the cap at ${shrunk}, not above ${base}`,
  );

  // the whole formula, not just its direction: every wire byte the sheet
  // gains comes out of the cap at the measured expansion ratio
  for (const sheetWire of [8_000, 200]) {
    const moved = base - sourceCapBytes({ ...view, sheetWire });
    const owed = (sheetWire - stylesheetWireBytes) / wirePerSourceByte;

    assert.ok(
      Math.abs(moved - owed) <= 1,
      `a sheet of ${sheetWire} wire bytes moved the cap by ${moved}, not the ${owed.toFixed(1)} it costs`,
    );
  }
});

test("a bigger stylesheet renders fewer lines, not just a smaller number", () => {
  const shown = (sheetWire: number) => {
    const markup = blobPage({
      repo: "linklater",
      blob: hugeBlob,
      sheetWire,
    });
    const notice = noticePattern.exec(markup);
    assert.ok(notice, `no notice at sheetWire ${sheetWire}`);

    return Number((notice[1] as string).replaceAll(",", ""));
  };

  assert.ok(
    shown(8_000) < shown(200),
    "the rendered line count did not follow the stylesheet's size",
  );
});

test("every rendered blob page fits the budget as real gzip-5 wire bytes", () => {
  const pages: [string, string][] = [
    ["small text", blobPage({ repo: "linklater", blob: smallBlob, rawOrigin })],
    [
      "truncated text",
      blobPage({ repo: "linklater", blob: hugeBlob, rawOrigin }),
    ],
    [
      "denser truncated text",
      blobPage({
        repo: "linklater",
        blob: textBlob("src/wide.ts", largeSource(20_000)),
        rawOrigin,
      }),
    ],
    [
      "span-crossing text",
      blobPage({ repo: "linklater", blob: spanningBlob, rawOrigin }),
    ],
    [
      "inline raster",
      blobPage({ repo: "linklater", blob: imageBlob, rawOrigin }),
    ],
    [
      "oversize raster",
      blobPage({
        repo: "linklater",
        blob: rasterBlob("assets/huge.png", pngBody, 2_400_000),
        rawOrigin,
      }),
    ],
    [
      "binary",
      blobPage({
        repo: "linklater",
        blob: binaryBlob("media/clip.mp4", 44_040_192),
        rawOrigin,
      }),
    ],
  ];

  for (const [state, markup] of pages) {
    const weight = pageWireBytes(markup);

    assert.ok(
      weight <= budgetBytes,
      `the ${state} blob page weighs ${weight} wire bytes against a ${budgetBytes} B budget`,
    );
  }
});

test("a raster under the cap inlines first-party, eagerly, with no alt", () => {
  const markup = blobPage({ repo: "linklater", blob: imageBlob, rawOrigin });
  const src = blobAssetPath("linklater", {
    oid: imageBlob.oid,
    format: sniffRaster(pngBody) as NonNullable<ReturnType<typeof sniffRaster>>,
  });

  assert.ok(
    markup.includes(`<img class="preview" src="${src}" alt="" />`),
    "the raster did not inline at its content-addressed first-party path",
  );
  assert.doesNotMatch(
    markup,
    /loading="lazy"/,
    "a lazily loaded image shifts the layout when it lands, and nothing server-side can emit width and height for it",
  );
  assert.doesNotMatch(
    markup,
    /<pre class="src"/,
    "a raster reached the highlighter",
  );
  assert.ok(
    src.startsWith("/r/"),
    "the inline src left the first-party origin",
  );
});

test("an oversize raster and a binary decline in the file's own words", () => {
  const oversize = blobPage({
    repo: "linklater",
    blob: rasterBlob("assets/huge.png", pngBody, 2_516_582),
  });

  assert.ok(oversize.includes("PNG image, 2.4 MB. Too large to show here."));
  assert.doesNotMatch(oversize, /<img/);

  const clip = blobPage({
    repo: "linklater",
    blob: binaryBlob("media/clip.mp4", 4_404_019),
  });

  assert.ok(clip.includes("MP4 video, 4.2 MB. Not shown here."));

  // past the read cap it cannot state a line count, so it states its size
  const unread = blobPage({
    repo: "linklater",
    blob: binaryBlob("media/feature.mp4", 44_040_192),
  });

  assert.ok(unread.includes("MP4 video, 42.0 MB. Too large to show here."));

  const unknown = blobPage({
    repo: "linklater",
    blob: binaryBlob("build/carn", 8_400),
  });

  assert.ok(unknown.includes("Binary file, 8.2 KB. Not shown here."));

  for (const markup of [oversize, clip, unread, unknown]) {
    assert.match(markup, /<div class="empty">/);
    assert.doesNotMatch(
      markup,
      /no preview available/i,
      "the copy claims an absence rather than naming a decision",
    );
  }
});

// an svg is repo-controlled markup whose title and text enter the host
// page's accessibility tree, so it never inlines however small it is
test("an svg blob renders as source and never as an inline image", () => {
  const markup = blobPage({ repo: "linklater", blob: svgBlob, rawOrigin });

  assert.doesNotMatch(markup, /<img class="preview"/);
  assert.match(markup, /<pre class="src"/);

  const body = codeBody(markup);

  assert.ok(!body.includes("<title>"), "an svg <title> reached the page raw");
  assert.ok(!body.includes("<svg"), "an svg element reached the page raw");
  assert.ok(body.includes("&lt;"), "the svg source went unescaped");
  assert.ok(body.includes("injected"), "the svg rendered as nothing at all");
});

test("the source block carries the region semantics the audit needs", () => {
  const markup = blobPage({ repo: "linklater", blob: smallBlob });

  assert.match(
    markup,
    /<pre class="src" tabindex="0" role="region" aria-labelledby="blob-h">/,
  );
  assert.doesNotMatch(
    markup,
    /<div[^>]*tabindex="0"/,
    "a div wrapper around the block fails focus-order-semantics",
  );
  assert.match(markup, /<h1 class="t-item" lang="en" id="blob-h">/);
  assert.strictEqual((markup.match(/<h1/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /<h1[^>]*aria-label/);
  assert.doesNotMatch(markup, /<h1 class="vh"/);
});

test("nothing but the file's own bytes goes inside the block", () => {
  const markup = blobPage({ repo: "linklater", blob: hugeBlob });
  const body = codeBody(markup);

  assert.doesNotMatch(body, /Showing the first/);
  assert.doesNotMatch(body, /class="ln"|line-number|data-line/);
  assert.doesNotMatch(body, /<a /);
});

test("counts are grouped the same way on every machine", () => {
  const markup = blobPage({ repo: "linklater", blob: hugeBlob });

  assert.ok(markup.includes("of 6,310."), "the notice total lost its groups");
  assert.ok(
    markup.includes("<dd>6,310</dd>"),
    "the Lines field is unformatted",
  );
});

test("an unregistered extension still renders in the same shape", () => {
  const odd = textBlob("notes/thoughts.qqq", "one\ntwo\nthree\n");
  const markup = blobPage({ repo: "linklater", blob: odd });

  assert.strictEqual(languageFor(odd.path), null);
  assert.match(markup, /<pre class="src" tabindex="0" role="region"/);
  assert.ok(markup.includes('<code class="hljs">'));
  assert.ok(markup.includes("<dd>Plain text</dd>"));
  assert.doesNotMatch(codeBody(markup), /<span/);
});

test("the extension map answers for the languages it registers", () => {
  const expected: [string, string][] = [
    ["src/app.ts", "typescript"],
    ["src/app.tsx", "typescript"],
    ["scripts/build.mjs", "javascript"],
    ["package.json", "json"],
    ["styles/main.css", "css"],
    ["prisma/init.sql", "sql"],
    ["scripts/verify.sh", "bash"],
    ["compose.yaml", "yaml"],
    ["README.md", "markdown"],
    ["main.py", "python"],
    ["cmd/serve.go", "go"],
    ["src/lib.rs", "rust"],
    ["index.html", "xml"],
    [".carn/header.svg", "xml"],
    ["Dockerfile", "dockerfile"],
    ["biome.toml", "ini"],
  ];

  for (const [path, id] of expected) {
    assert.strictEqual(languageFor(path)?.id, id, `${path} mapped wrong`);
  }

  assert.strictEqual(languageFor("LICENSE"), null);
  assert.strictEqual(languageFor(".gitignore"), null);
});

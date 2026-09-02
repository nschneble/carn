// SPDX-License-Identifier: AGPL-3.0-or-later

// the pinned world every visual story renders against: fixed uuids so the
// tarball layout and the seeded rows agree, fixed dates so the frozen
// clock always reads the same ages, and an ordered commit run per repo so
// a branch, a tag, and a second page of log have somewhere to point

import { deflateSync } from "node:zlib";

type FixtureFile = {
  path: string;
  body: string | Buffer;
  // a gitlink names the commit it pins, so its empty body is never hashed
  gitlink?: string;
};

type FixtureCommit = {
  message: string;
  at: string;
  files: FixtureFile[];
};

// commit is an ordinal into the repo's commits, unlike a commit's own at
type FixtureBranch = { name: string; commit: number };

// lightweight inherits the commit's subject and date, annotated its own
type FixtureTag =
  | { name: string; commit: number; kind: "lightweight" }
  | {
      name: string;
      commit: number;
      kind: "annotated";
      message: string;
      taggedAt: string;
    };

export type FixtureRepo = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  commits: FixtureCommit[];
  branches?: FixtureBranch[];
  tags?: FixtureTag[];
};

export const frozenNow = "2026-02-01T12:00:00.000Z";

export const visualDatabase = "carn_visual";
export const visualRepoRoot = "local/visual/repos";
export const visualHost = "127.0.0.1";
export const visualPort = Number(process.env.CARN_VISUAL_PORT ?? 4173);
export const visualOrigin = `http://${visualHost}:${visualPort}`;

export const fixtureAuthor = {
  name: "Nick Schneble",
  email: "nschneble@users.noreply.github.com",
};

const readme = [
  "# Linklater",
  "",
  "Save a URL, read it later. Linklater keeps a reading list you can push",
  "to from anywhere, with no account and no client-side JavaScript.",
  "",
  "## Install",
  "",
  "```sh",
  "git clone git@carn.example:linklater.git",
  "cd linklater",
  "npm install",
  "```",
  "",
  "## Refs",
  "",
  "| Ref | Kind | Note |",
  "| --- | --- | --- |",
  "| `main` | branch | the default |",
  "| `v1.2.0` | tag | the last release |",
  "",
  "## Notes",
  "",
  "- The reading list is one table, and one index on it",
  "- Fetches run on a timer, never on a page load",
  "- Read the [brand notes](docs/BRAND.md), the [spec](/docs/spec), the",
  "  [type scale](#type), or send [mail](mailto:hi@example.com)",
  "",
  "> Quiet software is the goal.",
  "",
].join("\n");

// 1600x400 and transparent, geometry only; an svg in an <img> reaches no
// @font-face, so text would differ across machines
function header(ink: string, rule: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" width="1600" height="400">',
    `  <rect x="64" y="120" width="900" height="40" fill="${ink}" />`,
    `  <rect x="64" y="200" width="560" height="16" fill="${rule}" />`,
    `  <rect x="64" y="256" width="1472" height="4" fill="${rule}" />`,
    "</svg>",
    "",
  ].join("\n");
}

export const fixtureHeaders = {
  light: header("#141617", "#9aa0a0"),
  dark: header("#f2f4f4", "#6c7272"),
};

function scramble(seed: number): number {
  let h = Math.imul(seed, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function buildCrcTable(): Int32Array {
  const table = new Int32Array(256);

  for (let byte = 0; byte < 256; byte += 1) {
    let crc = byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[byte] = crc;
  }

  return table;
}

const crcTable = buildCrcTable();

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);

  let checksum = -1;
  for (const byte of body) {
    checksum =
      (crcTable[(checksum ^ byte) & 0xff] as number) ^ (checksum >>> 8);
  }

  const length = Buffer.alloc(4);
  const sum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  sum.writeUInt32BE((checksum ^ -1) >>> 0);

  return Buffer.concat([length, body, sum]);
}

// level 0 is stored blocks, which a future zlib cannot re-encode smaller
function png(width: number, height = width): Buffer {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = 2;

  const stride = width * 3 + 1;
  const rows = Buffer.alloc(height * stride);

  for (let row = 0; row < height; row += 1) {
    for (let column = 1; column < stride; column += 1) {
      rows[row * stride + column] = scramble(row * stride + column) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", head),
    pngChunk("IDAT", deflateSync(rows, { level: 0 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// .src never wraps, so 500-byte lines cap out at ~150 rows, not 2,500
function tableSource(lines: number): string {
  const rows = Array.from({ length: lines }, (_, row) => {
    const cells = Array.from(
      { length: 40 },
      (_, cell) =>
        `0x${scramble(row * 40 + cell)
          .toString(16)
          .padStart(8, "0")}`,
    );

    return `export const row${String(row).padStart(3, "0")} = [${cells.join(", ")}];`;
  });

  return `${rows.join("\n")}\n`;
}

const base64Alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function unbreakableSource(lines: number, width: number): string {
  const rows = Array.from({ length: lines }, (_, row) => {
    const run = Array.from(
      { length: width },
      (_, at) =>
        base64Alphabet[scramble(row * width + at) % base64Alphabet.length],
    ).join("");

    return `export const c${String(row).padStart(3, "0")} = "${run}";`;
  });

  return `${rows.join("\n")}\n`;
}

// an ordinary source file, long enough to show line-height, syntax color,
// and the source block's proportions — the one-line index.ts proves the
// truncation math but shows a reader nothing about the everyday page
const manifestSource = [
  "// the manifest gantry reads at boot: one rig per slot, six slots on",
  "// the frame, and nothing else touches this file",
  "",
  'import { readFileSync } from "node:fs";',
  'import { join } from "node:path";',
  "",
  "export type Rig = {",
  "  slot: string;",
  "  name: string;",
  "  weightKg: number;",
  "  installed: string;",
  "};",
  "",
  'const manifestPath = join(process.cwd(), "rigs.json");',
  "const maxSlots = 6;",
  "",
  "function parseManifest(raw: string): Rig[] {",
  "  const parsed = JSON.parse(raw) as unknown;",
  "",
  "  if (!Array.isArray(parsed)) {",
  '    throw new Error("rigs.json must be an array");',
  "  }",
  "",
  "  return parsed as Rig[];",
  "}",
  "",
  "export function loadRigs(): Rig[] {",
  '  const raw = readFileSync(manifestPath, "utf8");',
  "  const rigs = parseManifest(raw);",
  "",
  "  if (rigs.length > maxSlots) {",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source text for the fixture file, not an interpolation
  "    throw new Error(`gantry holds ${maxSlots} rigs, manifest lists ${rigs.length}`);",
  "  }",
  "",
  "  return rigs;",
  "}",
  "",
  "export function totalWeight(rigs: Rig[]): number {",
  "  return rigs.reduce((sum, rig) => sum + rig.weightKg, 0);",
  "}",
  "",
  "export function slotFor(rigs: Rig[], name: string): string | null {",
  "  const found = rigs.find((rig) => rig.name === name);",
  "  return found?.slot ?? null;",
  "}",
  "",
  "// installed dates sort oldest first, so the newest rig prints last",
  "export function byInstalled(rigs: Rig[]): Rig[] {",
  "  return [...rigs].sort((a, b) => a.installed.localeCompare(b.installed));",
  "}",
  "",
].join("\n");

function modules(count: number): FixtureFile[] {
  return Array.from({ length: count }, (_, at) => {
    const name = `mod-${String(at).padStart(2, "0")}`;

    return {
      path: `apps/web/src/${name}.ts`,
      body: `export function ${name.replace("-", "")}(): string {\n  return "${name}";\n}\n`,
    };
  });
}

// minutes before frozenNow, oldest commit first — spread across the whole
// window the repo has to give (createdAt to frozenNow) rather than a
// uniform step, so the age column reads minutes through weeks instead of
// one value twenty-six times over
const gantryOffsetsMinutes = [
  37440, 34560, 31680, 30240, 28800, 27360, 25920, 24480, 23040, 21600, 20160,
  18720, 17280, 15840, 14400, 12960, 11520, 10080, 8640, 7200, 5760, 4320, 2880,
  1440, 360, 25,
];

function gantryAt(index: number): string {
  const minutes = gantryOffsetsMinutes[index];
  if (minutes === undefined) {
    throw new Error(`gantry commit ${index} has no offset`);
  }

  return new Date(Date.parse(frozenNow) - minutes * 60_000).toISOString();
}

function gantryCommits(): FixtureCommit[] {
  const modular = modules(18).map((file, at) => ({
    message: `Add ${file.path.split("/").pop()}`,
    at: gantryAt(3 + at),
    files: [file],
  }));

  return [
    {
      message: "Stand the gantry up",
      at: gantryAt(0),
      files: [
        {
          path: "README.md",
          body: "# Gantry\n\nA rig that holds the other rigs.\n",
        },
        { path: "package.json", body: '{ "name": "gantry" }\n' },
        { path: "src/index.ts", body: "export const version = 1;\n" },
      ],
    },
    {
      message: "Bring the assets in",
      at: gantryAt(1),
      files: [
        { path: "assets/large.png", body: png(160) },
        { path: "assets/logo.png", body: png(8) },
        { path: "assets/small.bin", body: Buffer.alloc(512) },
      ],
    },
    {
      message: "Pin the vendored library",
      at: gantryAt(2),
      files: [
        {
          path: "vendor/lib",
          body: "",
          gitlink: "a3f29c81de4b7205f16e8c93a0d5b7e2f1c4a9d6",
        },
      ],
    },
    ...modular,
    {
      message: "Reach the deep path",
      at: gantryAt(21),
      files: [
        {
          path: "apps/web/src/deep.ts",
          body: "export const depth = 3;\n",
        },
      ],
    },
    {
      message: "Bump the version and say so",
      at: gantryAt(22),
      files: [
        { path: "src/index.ts", body: "export const version = 2;\n" },
        {
          path: "README.md",
          body: "# Gantry\n\nA rig that holds the other rigs.\n\nVersion 2.\n",
        },
      ],
    },
    {
      message: "Write the rig manifest",
      at: gantryAt(23),
      files: [{ path: "src/manifest.ts", body: manifestSource }],
    },
    {
      message: "Add a cover image",
      at: gantryAt(24),
      files: [{ path: "assets/cover.png", body: png(400, 200) }],
    },
    // the page inlines a prefix of the diffs, so these two sort first
    {
      message: "Generate the tables",
      at: gantryAt(25),
      files: [
        { path: "src/api.ts", body: "export const routes = ['/health'];\n" },
        { path: "src/app.ts", body: "export const name = 'gantry';\n" },
        { path: "src/big.ts", body: tableSource(240) },
        { path: "src/index.ts", body: "export const version = 3;\n" },
        {
          path: "src/notes.md",
          body: "# Notes\n\nThe tables are generated.\n",
        },
        { path: "src/wide.ts", body: unbreakableSource(75, 1180) },
      ],
    },
  ];
}

export const fixtureRepos: FixtureRepo[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "linklater",
    description: "Save a URL, read it later.",
    createdAt: "2026-01-18T09:00:00.000Z",
    commits: [
      {
        message: "Read the list back",
        at: "2026-01-18T09:30:00.000Z",
        files: [
          { path: ".carn/header-dark.svg", body: fixtureHeaders.dark },
          { path: ".carn/header-light.svg", body: fixtureHeaders.light },
          { path: "README.md", body: readme },
          {
            path: "docs/BRAND.md",
            body: "# Brand\n\nOne accent, no motion.\n",
          },
          { path: "package.json", body: '{ "name": "linklater" }\n' },
          { path: "src/index.ts", body: "export {};\n" },
          { path: "src/store.ts", body: "export const rows = [];\n" },
        ],
      },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "moonlight",
    description: "Phases, tides, and a lunar calendar.",
    createdAt: "2026-01-30T12:00:00.000Z",
    commits: [
      {
        message: "First quarter",
        at: "2026-01-30T12:20:00.000Z",
        files: [
          { path: "README.md", body: "# Moonlight\n\nPhases and tides.\n" },
          { path: "phases.csv", body: "date,phase\n2026-02-01,waxing\n" },
        ],
      },
    ],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "sparrow",
    description: null,
    createdAt: "2026-02-01T11:45:00.000Z",
    commits: [],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "thicket",
    description: "A shell script and nothing else.",
    createdAt: "2026-02-01T06:00:00.000Z",
    commits: [
      {
        message: "Plant it",
        at: "2026-02-01T06:10:00.000Z",
        files: [{ path: "thicket.sh", body: "#!/bin/sh\necho thicket\n" }],
      },
    ],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "gantry",
    description: "A rig that holds the other rigs.",
    createdAt: "2026-01-05T08:00:00.000Z",
    commits: gantryCommits(),
    branches: [{ name: "topic", commit: 2 }],
    tags: [
      { name: "v1.0.0", commit: 1, kind: "lightweight" },
      {
        name: "v1.1.0",
        commit: 22,
        kind: "annotated",
        message: "Version 2, with the deep path in place",
        taggedAt: "2026-01-31T12:00:00.000Z",
      },
    ],
  },
];

export function fixtureRepoPath(id: string): string {
  return `${id.slice(0, 2)}/${id}.git`;
}

// SPDX-License-Identifier: AGPL-3.0-or-later

// the pinned world every visual story renders against: fixed uuids so the
// tarball layout and the seeded rows agree, fixed dates so the frozen
// clock always reads the same ages

export type FixtureFile = { path: string; body: string };

export type FixtureRepo = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  commit: { message: string; at: string; files: FixtureFile[] } | null;
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

const header = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 200" width="1200" height="200">',
  '  <rect width="1200" height="200" fill="#1c1b1a" />',
  '  <text x="48" y="120" font-family="monospace" font-size="72" fill="#f5f2ef">linklater</text>',
  "</svg>",
  "",
].join("\n");

export const fixtureRepos: FixtureRepo[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "linklater",
    description: "Save a URL, read it later.",
    createdAt: "2026-01-18T09:00:00.000Z",
    commit: {
      message: "Read the list back",
      at: "2026-01-18T09:30:00.000Z",
      files: [
        { path: ".carn/header.svg", body: header },
        { path: "README.md", body: readme },
        { path: "docs/BRAND.md", body: "# Brand\n\nOne accent, no motion.\n" },
        { path: "package.json", body: '{ "name": "linklater" }\n' },
        { path: "src/index.ts", body: "export {};\n" },
        { path: "src/store.ts", body: "export const rows = [];\n" },
      ],
    },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "moonlight",
    description: "Phases, tides, and a lunar calendar.",
    createdAt: "2026-01-30T12:00:00.000Z",
    commit: {
      message: "First quarter",
      at: "2026-01-30T12:20:00.000Z",
      files: [
        { path: "README.md", body: "# Moonlight\n\nPhases and tides.\n" },
        { path: "phases.csv", body: "date,phase\n2026-02-01,waxing\n" },
      ],
    },
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "sparrow",
    description: null,
    createdAt: "2026-02-01T11:45:00.000Z",
    commit: null,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "thicket",
    description: "A shell script and nothing else.",
    createdAt: "2026-02-01T06:00:00.000Z",
    commit: {
      message: "Plant it",
      at: "2026-02-01T06:10:00.000Z",
      files: [{ path: "thicket.sh", body: "#!/bin/sh\necho thicket\n" }],
    },
  },
];

export function fixtureRepoPath(id: string): string {
  return `${id.slice(0, 2)}/${id}.git`;
}

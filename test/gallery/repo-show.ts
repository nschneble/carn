// SPDX-License-Identifier: AGPL-3.0-or-later

import { repoShowPage } from "../../src/html/repo-show.js";
import type { HeaderImage } from "../../src/repos/header.js";
import type { RepoView } from "../../src/repos/show.js";
import type { Touch, TreeEntry } from "../../src/repos/tree.js";
import { fixtureHeaders, frozenNow } from "../support/fixture-repos.js";

const tip = "c".repeat(40);

export const treeNow = new Date(frozenNow);

const subjects = [
  "Read the list back",
  "Fetch on a timer rather than on a page load",
  "Pin the reading list to one table",
  "Escape the title before it reaches the page",
  "Keep the tarball byte-reproducible",
];

// every eighth entry goes un-attributed, which is what the bounded walk
// leaves behind on a path it never reached
function touch(index: number): Touch | null {
  if (index % 8 === 7) return null;

  return {
    subject: subjects[index % subjects.length] as string,
    at: new Date(treeNow.getTime() - (index + 1) * 3_600_000),
  };
}

const lightHeader: HeaderImage = {
  path: ".carn/header-light.svg",
  oid: "d".repeat(40),
  bytes: Buffer.byteLength(fixtureHeaders.light, "utf8"),
};

const darkHeader: HeaderImage = {
  path: ".carn/header-dark.svg",
  oid: "e".repeat(40),
  bytes: Buffer.byteLength(fixtureHeaders.dark, "utf8"),
};

// the two bodies the visual fixture commits, at the two paths it commits
// them to, so the audit and the capture render the same header
export const committedHeader = { light: lightHeader, dark: darkHeader };

function file(name: string, index: number, bytes = 512): TreeEntry {
  return {
    name,
    oid: "0".repeat(40),
    kind: "file",
    bytes,
    touched: touch(index),
  };
}

function directory(name: string, index: number): TreeEntry {
  return {
    name,
    oid: "1".repeat(40),
    kind: "directory",
    bytes: null,
    touched: touch(index),
  };
}

export const submodule: TreeEntry = {
  name: "vendor",
  oid: "9".repeat(40),
  kind: "gitlink",
  bytes: null,
  touched: null,
};

export const directories = [
  ".github",
  "docs",
  "fonts",
  "prisma",
  "scripts",
  "src",
  "test",
].map(directory);

export const files = [
  ".gitignore",
  "Dockerfile",
  "LICENSE",
  "README.md",
  "biome.json",
  "compose.yaml",
  "package-lock.json",
  "package.json",
  "prisma.config.ts",
  "tsconfig.json",
].map((name, index) => file(name, index));

// nineteen more so the sixteen-row cap has something to hide
export const wide = [
  ...directories,
  ...files,
  ...Array.from({ length: 19 }, (_, index) =>
    file(`Fixture${index}.tsx`, index, 1024 + index),
  ),
];

export const readmeSource = `# Linklater

Save a URL, read it later. Self-hosted, and the whole thing is a Compose
file.

## Getting it running

1. Copy \`.env.example\` to \`.env\`
2. Run \`docker compose up -d\`
3. Open <http://localhost:3000>

| Ref | Kind | Note |
| --- | --- | --- |
| \`main\` | branch | the default |
| \`v1.0.0\` | tag | signed, annotated |

\`\`\`sh
git clone git@carn.example:linklater && cd linklater && npm install
\`\`\`

> Pushing to a name that doesn't exist creates it.

See [the brand book](docs/BRAND.md), [the spec](/docs/spec), [the type
section](#type), [the maintainer](mailto:nick@example.com), and
[the upstream](https://example.com/upstream).

![A screenshot of the reading list](https://example.com/shot.png)

---

Built on git.
`;

export const hostileReadme = `# Payloads

<script>alert(1)</script>

[click me](javascript:alert(1))

<img src=x onerror=alert(1)>

![remote](https://evil.example/track.png)
`;

export function view(options: Partial<RepoView> = {}): RepoView {
  return {
    name: "linklater",
    branch: "main",
    tip,
    header: { light: "wordmark", dark: "wordmark" },
    entries: wide,
    readme: readmeSource,
    ...options,
  };
}

export const empty: RepoView = view({
  tip: null,
  entries: [],
  readme: null,
});

export function showDocument(
  options: { repo?: RepoView; showAll?: boolean } = {},
): string {
  return repoShowPage({
    repo: options.repo ?? view(),
    showAll: options.showAll ?? false,
    now: treeNow,
  });
}

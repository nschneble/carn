// SPDX-License-Identifier: AGPL-3.0-or-later

import { repoShowPage } from "../../src/html/repo-show.js";
import type { Theme } from "../../src/html/theme.js";
import type { RepoView } from "../../src/repos/show.js";
import type { TreeEntry } from "../../src/repos/tree.js";

const tip = "c".repeat(40);

function file(name: string, bytes = 512): TreeEntry {
  return { name, oid: "0".repeat(40), directory: false, bytes };
}

function directory(name: string): TreeEntry {
  return { name, oid: "1".repeat(40), directory: true, bytes: null };
}

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
].map((name) => file(name));

// nineteen more so the sixteen-row cap has something to hide
export const wide = [
  ...directories,
  ...files,
  ...Array.from({ length: 19 }, (_, index) =>
    file(`Fixture${index}.tsx`, 1024 + index),
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

export function showDocument(options: {
  theme: Theme | null;
  repo?: RepoView;
  showAll?: boolean;
}): string {
  return repoShowPage({
    repo: options.repo ?? view(),
    theme: options.theme,
    showAll: options.showAll ?? false,
  });
}

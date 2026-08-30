// SPDX-License-Identifier: AGPL-3.0-or-later

import { repoListPage } from "../../src/html/repo-list.js";
import type { RepoSummary } from "../../src/repos/list.js";

export const frozen = new Date("2026-08-27T12:00:00.000Z");

function at(iso: string): Date {
  return new Date(iso);
}

function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw({ raw: strings }, ...values);
}

export const populated: RepoSummary[] = [
  {
    name: "carn",
    description: "A self-hosted git forge. Repos, issues, and PRs.",
    createdAt: at("2026-08-25T09:14:00.000Z"),
  },
  {
    name: "gelatinous-cube",
    description: 'The blob origin. "Say <what> it does" & why.',
    createdAt: at("2026-08-20T17:02:00.000Z"),
  },
  {
    name: "linklater",
    description: "Save a URL, read it later.",
    createdAt: at("2026-05-11T08:30:00.000Z"),
  },
  {
    name: "steading-of-the-hill-giant-chieftain-and-the-glacial-rift",
    description:
      "A name past the documented forty-character cap, to prove the column ellipsis holds.",
    createdAt: at("2025-02-03T11:45:00.000Z"),
  },
  {
    name: "wm",
    description: null,
    createdAt: at("2026-08-27T11:20:00.000Z"),
  },
];

export const hoverSimulation = css`
.row.is-hover {
  background: var(--sunk);
}`;

export function indexDocument(
  options: { repos?: RepoSummary[]; hover?: boolean } = {},
): string {
  const markup = repoListPage({
    repos: options.repos ?? populated,
    now: frozen,
  });

  return options.hover === true
    ? markup.replace('<li class="row">', '<li class="row is-hover">')
    : markup;
}

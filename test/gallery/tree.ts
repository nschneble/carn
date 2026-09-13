// SPDX-License-Identifier: AGPL-3.0-or-later

import { treePage } from "../../src/html/tree-page.js";
import type { Tree } from "../../src/repos/tree.js";
import { files, submodule, treeNow, wide } from "./repo-show.js";

const nestedPath = "src/components";

export function tree(options: Partial<Tree> = {}): Tree {
  return { path: nestedPath, entries: files, ...options };
}

export function treeDocument(
  options: { repo?: string; rev?: string; tree?: Tree; showAll?: boolean } = {},
): string {
  return treePage({
    repo: options.repo ?? "linklater",
    rev: options.rev ?? "main",
    tree: options.tree ?? tree(),
    showAll: options.showAll ?? false,
    now: treeNow,
  });
}

export const withSubmodule = tree({
  entries: [submodule, ...files.slice(0, 3)],
});

export const wideTree = tree({ entries: wide });

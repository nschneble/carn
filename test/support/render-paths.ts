// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Theme } from "../../src/html/theme.js";

export type RenderPath = {
  name: string;
  theme: Theme | null;
  colorScheme: "light" | "dark";
  palette: Theme;
};

export const renderPaths: readonly RenderPath[] = [
  {
    name: 'data-theme="dark"',
    theme: "dark",
    colorScheme: "light",
    palette: "dark",
  },
  {
    name: 'data-theme="light"',
    theme: "light",
    colorScheme: "light",
    palette: "light",
  },
  {
    name: "unstamped under colorScheme light",
    theme: null,
    colorScheme: "light",
    palette: "light",
  },
  {
    name: "unstamped under colorScheme dark",
    theme: null,
    colorScheme: "dark",
    palette: "dark",
  },
];

// SPDX-License-Identifier: AGPL-3.0-or-later

// no theme is stamped, so a render path is just the system preference

export type RenderPath = {
  name: string;
  colorScheme: "light" | "dark";
  palette: "light" | "dark";
};

export const renderPaths: readonly RenderPath[] = [
  { name: "colorScheme light", colorScheme: "light", palette: "light" },
  { name: "colorScheme dark", colorScheme: "dark", palette: "dark" },
];

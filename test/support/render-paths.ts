// SPDX-License-Identifier: AGPL-3.0-or-later

// nothing is stamped on the document, so a render path is a system
// preference and the palette it selects, and there are only the two

export type RenderPath = {
  name: string;
  colorScheme: "light" | "dark";
  palette: "light" | "dark";
};

export const renderPaths: readonly RenderPath[] = [
  { name: "colorScheme light", colorScheme: "light", palette: "light" },
  { name: "colorScheme dark", colorScheme: "dark", palette: "dark" },
];

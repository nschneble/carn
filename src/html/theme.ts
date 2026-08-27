// SPDX-License-Identifier: AGPL-3.0-or-later

export type Theme = "dark" | "light";

export const themeCookie = "theme";

const themes: ReadonlySet<string> = new Set(["dark", "light"]);

export function readTheme(cookieHeader: string | undefined): Theme | null {
  if (cookieHeader === undefined) return null;

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== themeCookie) continue;

    const value = pair.slice(separator + 1).trim();
    if (themes.has(value)) return value as Theme;
  }

  return null;
}

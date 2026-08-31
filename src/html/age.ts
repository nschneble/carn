// SPDX-License-Identifier: AGPL-3.0-or-later

import { html, type Raw } from "./index.js";

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const week = 7 * day;
const year = 365 * day;

const steps: [number, string][] = [
  [minute, "m"],
  [hour, "h"],
  [day, "d"],
  [week, "w"],
  [year, "y"],
];

export function age(at: Date, now: Date): string {
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < minute) return "now";

  let [span, suffix] = steps[0] as [number, string];
  for (const step of steps) {
    if (elapsed < step[0]) break;
    [span, suffix] = step;
  }

  return `${Math.floor(elapsed / span)}${suffix}`;
}

export function ageMarkup(label: string, at: Date, now: Date): Raw {
  return html`<span class="age"><span class="vh">${label} </span><time datetime="${at.toISOString()}">${age(at, now)}</time></span>`;
}

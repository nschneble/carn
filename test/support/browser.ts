// SPDX-License-Identifier: AGPL-3.0-or-later

// one chromium per test file, and one shape for the ambient document the
// two browser-driven contracts each declare for their own page.evaluate

import { type Browser, chromium } from "playwright";

export type BrowserDocument = {
  documentElement: object;
  fonts: { ready: Promise<unknown> };
};

let shared: Browser | undefined;

export async function browser(): Promise<Browser> {
  shared ??= await chromium.launch();
  return shared;
}

export async function closeBrowser(): Promise<void> {
  await shared?.close();
  shared = undefined;
}

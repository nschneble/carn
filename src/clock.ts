// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from "./config.js";

// relative ages render server-side, so only a server seam can freeze them
export function now(): Date {
  return config.frozenNow ?? new Date();
}

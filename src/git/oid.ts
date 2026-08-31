// SPDX-License-Identifier: AGPL-3.0-or-later

// git's sha1 and sha256 object ids (unanchored so callers can embed them)

export const oidSource = "[0-9a-f]{40}(?:[0-9a-f]{24})?";
export const oidPattern = new RegExp(`^${oidSource}$`);

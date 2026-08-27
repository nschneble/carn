// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from "../config.js";

const sshDefaultPort = 22;

export function sshRemote(name: string): string {
  if (config.sshPort === sshDefaultPort) {
    return `git@${config.sshHost}:${name}`;
  }

  return `ssh://git@${config.sshHost}:${config.sshPort}/${name}`;
}

// SPDX-License-Identifier: AGPL-3.0-or-later

// the real app minus the ssh listener, for tuffgal to drive

import { buildApp } from "../src/app.js";
import { visualHost, visualPort } from "../test/support/fixture-repos.js";

const app = buildApp();

try {
  await app.listen({ port: visualPort, host: visualHost });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

process.on("SIGTERM", () => {
  app
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});

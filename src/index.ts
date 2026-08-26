// SPDX-License-Identifier: AGPL-3.0-or-later

import { buildApp } from "./app.js";
import { config } from "./config.js";
import { buildSshServer } from "./ssh/server.js";

const app = buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

const sshServer = buildSshServer();

sshServer.on("error", (error: NodeJS.ErrnoException) => {
  app.log.error(error);
  if (error.code === "EADDRINUSE" || error.code === "EACCES") process.exit(1);
});

sshServer.listen(config.sshPort, config.sshHost, () => {
  app.log.info(
    `SSH server listening at ssh://${config.sshHost}:${config.sshPort}`,
  );
});

// close() frees the port at once; its callback waits for open sessions
async function shutdown(): Promise<void> {
  sshServer.close();
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", () => {
  shutdown().catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
});

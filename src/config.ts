// SPDX-License-Identifier: AGPL-3.0-or-later

function read(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (value === undefined) {
    console.error(
      `${name} isn't set. Pass --env-file=.env to node, or export ${name}.`,
    );
    process.exit(1);
  }

  return value;
}

function readPort(name: string, fallback: string): number {
  const raw = read(name, fallback);
  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    console.error(
      `${name} must be an integer between 1 and 65535 (got ${raw}).`,
    );
    process.exit(1);
  }

  return value;
}

export const config = Object.freeze({
  databaseUrl: read("DATABASE_URL"),
  host: read("HOST", "127.0.0.1"),
  nodeEnv: read("NODE_ENV", "development"),
  port: readPort("PORT", "3000"),
  repoRoot: read("CARN_REPO_ROOT", "./local/repos"),
  sourceUrl: read("CARN_SOURCE_URL", "https://github.com/nschneble/carn"),
  sshHost: read("CARN_SSH_HOST", "127.0.0.1"),
  sshHostKey: read("CARN_SSH_HOST_KEY", "./local/ssh_host_ed25519_key"),
  sshPort: readPort("CARN_SSH_PORT", "2222"),
});

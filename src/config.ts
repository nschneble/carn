// SPDX-License-Identifier: AGPL-3.0-or-later

function read(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;

  if (value === undefined) {
    console.error(
      `${name} isn't set. Pass --env-file=.env to node, or export ${name}.`,
    );
    process.exit(1);
  }

  return value;
}

export const config = Object.freeze({
  databaseUrl: read("DATABASE_URL"),
  host: read("HOST", "127.0.0.1"),
  nodeEnv: read("NODE_ENV", "development"),
  port: Number(read("PORT", "3000")),
});

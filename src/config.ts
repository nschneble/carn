// SPDX-License-Identifier: AGPL-3.0-or-later

function read(name: string, fallback?: string): string {
  const value = process.env[name] || fallback

  if (value === undefined) {
    console.error(`${name} is not set. Copy .env.example to .env, or export ${name}.`)
    process.exit(1)
  }

  return value
}

export const config = Object.freeze({
  databaseUrl: read('DATABASE_URL'),
  port: Number(read('PORT', '3000')),
  host: read('HOST', '127.0.0.1'),
  nodeEnv: read('NODE_ENV', 'development'),
})

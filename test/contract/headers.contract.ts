// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert'
import { test } from 'node:test'

import { buildApp } from '../../src/app.js'

const securityHeaders = {
  'content-security-policy':
    "default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

test('health reports the process is up, as json', async () => {
  const app = buildApp()
  const response = await app.inject({ method: 'GET', url: '/health' })
  await app.close()

  assert.strictEqual(response.statusCode, 200)
  assert.ok(String(response.headers['content-type']).startsWith('application/json'))
  assert.strictEqual(response.body, '{"status":"ok"}')
})

test('the security headers reach a hit and a miss alike', async () => {
  const app = buildApp()
  const hit = await app.inject({ method: 'GET', url: '/health' })
  const miss = await app.inject({ method: 'GET', url: '/not-a-route' })
  await app.close()

  assert.strictEqual(hit.statusCode, 200)
  assert.strictEqual(miss.statusCode, 404)

  for (const [name, value] of Object.entries(securityHeaders)) {
    assert.strictEqual(hit.headers[name], value)
    assert.strictEqual(miss.headers[name], value)
  }
})

// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from 'fastify'

export function healthRoute(app: FastifyInstance): void {
  app.get('/health', () => ({ status: 'ok' }))
}

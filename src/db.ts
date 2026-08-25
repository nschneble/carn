// SPDX-License-Identifier: AGPL-3.0-or-later

import { PrismaPg } from '@prisma/adapter-pg'

import { config } from './config.js'
import { PrismaClient } from './generated/prisma/client.js'

const adapter = new PrismaPg({ connectionString: config.databaseUrl })

export const db = new PrismaClient({ adapter })

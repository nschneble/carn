// SPDX-License-Identifier: AGPL-3.0-or-later

import { PrismaPg } from "@prisma/adapter-pg";

import { config } from "./config.js";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
export const db = new PrismaClient({ adapter });

// every 23505 arrives as P2002, functional indexes included
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

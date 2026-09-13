-- SPDX-License-Identifier: AGPL-3.0-or-later

-- Note: This migration has been hand-tuned. A regeneration must preserve
-- all of it. Don't f*ck it up.

BEGIN;

-- CreateEnum
-- this migration creates every table it touches so there's nothing to lock
-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE TYPE "grant_level" AS ENUM ('write', 'admin');

-- CreateTable
CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "handle" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "is_admin" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssh_keys" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "public_key" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ(3),

  CONSTRAINT "ssh_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repos" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "name" TEXT COLLATE "C" NOT NULL,
  "description" TEXT,
  "default_branch" TEXT NOT NULL DEFAULT 'main',
  -- int4 ceiling is 2,147,483,647 and issues/PRs are per repo; unreachable
  -- squawk-ignore prefer-bigint-over-int
  "next_number" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_grants" (
  "repo_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "level" "grant_level" NOT NULL,

  CONSTRAINT "repo_grants_pkey" PRIMARY KEY ("repo_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "ssh_keys_fingerprint_key"
  ON "ssh_keys"("fingerprint");

-- AddForeignKey
ALTER TABLE "ssh_keys" ADD CONSTRAINT "ssh_keys_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repos" ADD CONSTRAINT "repos_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_grants" ADD CONSTRAINT "repo_grants_repo_id_fkey"
  FOREIGN KEY ("repo_id") REFERENCES "repos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_grants" ADD CONSTRAINT "repo_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX repos_name_lower_key ON repos (lower(name));

ALTER TABLE repos ADD CONSTRAINT repos_name_format
  CHECK (name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$');

COMMIT;

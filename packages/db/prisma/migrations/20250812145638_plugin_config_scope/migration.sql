/*
  Warnings:

  - You are about to drop the column `scope` on the `PluginConfigInstance` table. All the data in the column will be lost.
  - Added the required column `scopeType` to the `PluginConfigInstance` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PluginConfigInstatnceScopeType" AS ENUM ('GLOBAL', 'USER', 'PROJECT');

-- AlterTable
ALTER TABLE "PluginConfigInstance" DROP COLUMN "scope",
ADD COLUMN     "scopeId" TEXT,
ADD COLUMN     "scopeMeta" JSONB,
ADD COLUMN     "scopeType" "PluginConfigInstatnceScopeType" NOT NULL;

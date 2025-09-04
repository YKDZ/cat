/*
  Warnings:

  - You are about to drop the column `scopeId` on the `PluginConfigInstance` table. All the data in the column will be lost.
  - You are about to drop the column `scopeMeta` on the `PluginConfigInstance` table. All the data in the column will be lost.
  - You are about to drop the column `scopeType` on the `PluginConfigInstance` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."PluginConfigInstance_configId_scopeType_scopeId_key";

-- AlterTable
ALTER TABLE "public"."PluginConfigInstance" DROP COLUMN "scopeId",
DROP COLUMN "scopeMeta",
DROP COLUMN "scopeType";

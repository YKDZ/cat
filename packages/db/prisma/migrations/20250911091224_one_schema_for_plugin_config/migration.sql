/*
  Warnings:

  - You are about to drop the column `key` on the `PluginConfig` table. All the data in the column will be lost.
  - You are about to drop the column `overridable` on the `PluginConfig` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[pluginId]` on the table `PluginConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."PluginConfig_key_idx";

-- DropIndex
DROP INDEX "public"."PluginConfig_pluginId_idx";

-- DropIndex
DROP INDEX "public"."PluginConfig_pluginId_key_key";

-- AlterTable
ALTER TABLE "public"."PluginConfig" DROP COLUMN "key",
DROP COLUMN "overridable";

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfig_pluginId_key" ON "public"."PluginConfig"("pluginId");

/*
  Warnings:

  - You are about to drop the column `pluginGlobalConfigInstanceId` on the `PluginConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PluginConfig" DROP COLUMN "pluginGlobalConfigInstanceId";

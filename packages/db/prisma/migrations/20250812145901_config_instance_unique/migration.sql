/*
  Warnings:

  - A unique constraint covering the columns `[configId,scopeType,scopeId]` on the table `PluginConfigInstance` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PluginConfigInstance_configId_creatorId_key";

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfigInstance_configId_scopeType_scopeId_key" ON "PluginConfigInstance"("configId", "scopeType", "scopeId");

/*
  Warnings:

  - A unique constraint covering the columns `[creatorId,configId]` on the table `PluginConfigInstance` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PluginConfigInstance_creatorId_configId_key" ON "PluginConfigInstance"("creatorId", "configId");

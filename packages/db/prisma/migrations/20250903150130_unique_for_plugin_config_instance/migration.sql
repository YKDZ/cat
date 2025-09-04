/*
  Warnings:

  - A unique constraint covering the columns `[pluginInstallationId,configId]` on the table `PluginConfigInstance` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PluginConfigInstance_pluginInstallationId_configId_key" ON "public"."PluginConfigInstance"("pluginInstallationId", "configId");

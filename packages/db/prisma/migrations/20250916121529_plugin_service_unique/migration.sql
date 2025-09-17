/*
  Warnings:

  - A unique constraint covering the columns `[serviceType,serviceId,pluginInstallationId]` on the table `PluginService` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."PluginService_serviceId_pluginInstallationId_key";

-- CreateIndex
CREATE UNIQUE INDEX "PluginService_serviceType_serviceId_pluginInstallationId_key" ON "public"."PluginService"("serviceType", "serviceId", "pluginInstallationId");

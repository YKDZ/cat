-- CreateTable
CREATE TABLE "public"."PluginInstallation" (
    "id" SERIAL NOT NULL,
    "scopeId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,

    CONSTRAINT "PluginInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PluginInstallation_scopeId_pluginId_key" ON "public"."PluginInstallation"("scopeId", "pluginId");

-- AddForeignKey
ALTER TABLE "public"."PluginInstallation" ADD CONSTRAINT "PluginInstallation_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "public"."Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

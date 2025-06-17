-- CreateTable
CREATE TABLE "PluginComponent" (
    "id" TEXT NOT NULL,
    "entry" TEXT NOT NULL,
    "mountOn" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PluginComponent_id_pluginId_key" ON "PluginComponent"("id", "pluginId");

-- AddForeignKey
ALTER TABLE "PluginComponent" ADD CONSTRAINT "PluginComponent_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `PluginTag` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PluginTag_name_key" ON "PluginTag"("name");

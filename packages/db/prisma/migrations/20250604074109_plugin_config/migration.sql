/*
  Warnings:

  - You are about to drop the column `content` on the `PluginConfig` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[pluginId,key]` on the table `PluginConfig` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `key` to the `PluginConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `PluginConfig` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PluginConfig" DROP COLUMN "content",
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "value" JSONB NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfig_pluginId_key_key" ON "PluginConfig"("pluginId", "key");

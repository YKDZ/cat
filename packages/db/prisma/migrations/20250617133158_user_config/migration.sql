/*
  Warnings:

  - You are about to drop the `PluginConfigInstance` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `pluginGlobalConfigInstanceId` to the `PluginConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `PluginConfig` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PluginConfigInstance" DROP CONSTRAINT "PluginConfigInstance_configId_fkey";

-- DropForeignKey
ALTER TABLE "PluginConfigInstance" DROP CONSTRAINT "PluginConfigInstance_creatorId_fkey";

-- AlterTable
ALTER TABLE "PluginConfig" ADD COLUMN     "pluginGlobalConfigInstanceId" INTEGER NOT NULL,
ADD COLUMN     "value" JSONB NOT NULL;

-- DropTable
DROP TABLE "PluginConfigInstance";

-- CreateTable
CREATE TABLE "PluginUserConfigInstance" (
    "id" SERIAL NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "creatorId" TEXT NOT NULL,
    "configId" INTEGER NOT NULL,

    CONSTRAINT "PluginUserConfigInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PluginUserConfigInstance_configId_creatorId_key" ON "PluginUserConfigInstance"("configId", "creatorId");

-- AddForeignKey
ALTER TABLE "PluginUserConfigInstance" ADD CONSTRAINT "PluginUserConfigInstance_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginUserConfigInstance" ADD CONSTRAINT "PluginUserConfigInstance_configId_fkey" FOREIGN KEY ("configId") REFERENCES "PluginConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

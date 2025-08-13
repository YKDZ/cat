/*
  Warnings:

  - You are about to drop the `PluginUserConfigInstance` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PluginUserConfigInstance" DROP CONSTRAINT "PluginUserConfigInstance_configId_fkey";

-- DropForeignKey
ALTER TABLE "PluginUserConfigInstance" DROP CONSTRAINT "PluginUserConfigInstance_creatorId_fkey";

-- DropTable
DROP TABLE "PluginUserConfigInstance";

-- CreateTable
CREATE TABLE "PluginConfigInstance" (
    "id" SERIAL NOT NULL,
    "value" JSONB NOT NULL,
    "scope" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "creatorId" TEXT NOT NULL,
    "configId" INTEGER NOT NULL,

    CONSTRAINT "PluginConfigInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfigInstance_configId_creatorId_key" ON "PluginConfigInstance"("configId", "creatorId");

-- AddForeignKey
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_configId_fkey" FOREIGN KEY ("configId") REFERENCES "PluginConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

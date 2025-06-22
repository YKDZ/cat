/*
  Warnings:

  - You are about to drop the column `value` on the `PluginConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PluginConfig" DROP COLUMN "value";

-- CreateTable
CREATE TABLE "PluginConfigInstance" (
    "id" SERIAL NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "creatorId" TEXT,
    "configId" INTEGER NOT NULL,

    CONSTRAINT "PluginConfigInstance_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_configId_fkey" FOREIGN KEY ("configId") REFERENCES "PluginConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

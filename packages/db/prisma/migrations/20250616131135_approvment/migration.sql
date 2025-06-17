/*
  Warnings:

  - You are about to drop the column `isApproved` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `lastApprovedAt` on the `Translation` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PluginComponent" DROP CONSTRAINT "PluginComponent_pluginId_fkey";

-- AlterTable
ALTER TABLE "Translation" DROP COLUMN "isApproved",
DROP COLUMN "lastApprovedAt";

-- CreateTable
CREATE TABLE "TranslationApprovment" (
    "id" SERIAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "translationId" INTEGER NOT NULL,
    "userId" TEXT,

    CONSTRAINT "TranslationApprovment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PluginComponent" ADD CONSTRAINT "PluginComponent_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationApprovment" ADD CONSTRAINT "TranslationApprovment_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationApprovment" ADD CONSTRAINT "TranslationApprovment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

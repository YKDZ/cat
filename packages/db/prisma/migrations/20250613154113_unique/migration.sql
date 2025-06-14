/*
  Warnings:

  - You are about to drop the column `default` on the `PluginConfig` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `PluginConfig` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `PluginConfig` table. All the data in the column will be lost.
  - You are about to drop the column `result` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,provider]` on the table `Account` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[previousVersionId]` on the table `TranslatableElement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[meta,documentId,isActive]` on the table `TranslatableElement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `schema` to the `PluginConfig` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "PluginConfig" DROP COLUMN "default",
DROP COLUMN "description",
DROP COLUMN "type",
ADD COLUMN     "schema" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "result",
ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "TranslatableElement" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "previousVersionId" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "email",
DROP COLUMN "emailVerified";

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_provider_key" ON "Account"("userId", "provider");

-- CreateIndex
CREATE INDEX "PluginConfig_pluginId_idx" ON "PluginConfig"("pluginId");

-- CreateIndex
CREATE INDEX "PluginConfig_key_idx" ON "PluginConfig"("key");

-- CreateIndex
CREATE INDEX "Task_meta_idx" ON "Task"("meta");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatableElement_previousVersionId_key" ON "TranslatableElement"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatableElement_meta_documentId_isActive_key" ON "TranslatableElement"("meta", "documentId", "isActive") WHERE "isActive" = true;

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- AddForeignKey
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "TranslatableElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

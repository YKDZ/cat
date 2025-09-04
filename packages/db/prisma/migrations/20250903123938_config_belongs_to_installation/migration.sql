/*
  Warnings:

  - You are about to drop the column `pluginId` on the `AuthProvider` table. All the data in the column will be lost.
  - You are about to drop the column `pluginId` on the `StorageProvider` table. All the data in the column will be lost.
  - You are about to drop the column `pluginId` on the `TermService` table. All the data in the column will be lost.
  - You are about to drop the column `pluginId` on the `TextVectorizer` table. All the data in the column will be lost.
  - You are about to drop the column `pluginId` on the `TransaltionAdvisor` table. All the data in the column will be lost.
  - You are about to drop the column `pluginId` on the `TranslatableFileHandler` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id,pluginInstallationId]` on the table `AuthProvider` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,pluginInstallationId]` on the table `StorageProvider` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,pluginInstallationId]` on the table `TermService` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,pluginInstallationId]` on the table `TextVectorizer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,pluginInstallationId]` on the table `TransaltionAdvisor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,pluginInstallationId]` on the table `TranslatableFileHandler` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `pluginInstallationId` to the `AuthProvider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pluginInstallationId` to the `PluginConfigInstance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pluginInstallationId` to the `StorageProvider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pluginInstallationId` to the `TermService` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pluginInstallationId` to the `TextVectorizer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pluginInstallationId` to the `TransaltionAdvisor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pluginInstallationId` to the `TranslatableFileHandler` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."AuthProvider" DROP CONSTRAINT "AuthProvider_pluginId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StorageProvider" DROP CONSTRAINT "StorageProvider_pluginId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TermService" DROP CONSTRAINT "TermService_pluginId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TextVectorizer" DROP CONSTRAINT "TextVectorizer_pluginId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TransaltionAdvisor" DROP CONSTRAINT "TransaltionAdvisor_pluginId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TranslatableFileHandler" DROP CONSTRAINT "TranslatableFileHandler_pluginId_fkey";

-- DropIndex
DROP INDEX "public"."AuthProvider_id_pluginId_key";

-- DropIndex
DROP INDEX "public"."StorageProvider_id_pluginId_key";

-- DropIndex
DROP INDEX "public"."TermService_id_pluginId_key";

-- DropIndex
DROP INDEX "public"."TextVectorizer_id_pluginId_key";

-- DropIndex
DROP INDEX "public"."TransaltionAdvisor_id_pluginId_key";

-- DropIndex
DROP INDEX "public"."TranslatableFileHandler_id_pluginId_key";

-- AlterTable
ALTER TABLE "public"."AuthProvider" DROP COLUMN "pluginId",
ADD COLUMN     "pluginInstallationId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."PluginConfigInstance" ADD COLUMN     "pluginInstallationId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."StorageProvider" DROP COLUMN "pluginId",
ADD COLUMN     "pluginInstallationId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."TermService" DROP COLUMN "pluginId",
ADD COLUMN     "pluginInstallationId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."TextVectorizer" DROP COLUMN "pluginId",
ADD COLUMN     "pluginInstallationId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."TransaltionAdvisor" DROP COLUMN "pluginId",
ADD COLUMN     "pluginInstallationId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."TranslatableFileHandler" DROP COLUMN "pluginId",
ADD COLUMN     "pluginInstallationId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AuthProvider_id_pluginInstallationId_key" ON "public"."AuthProvider"("id", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageProvider_id_pluginInstallationId_key" ON "public"."StorageProvider"("id", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "TermService_id_pluginInstallationId_key" ON "public"."TermService"("id", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "TextVectorizer_id_pluginInstallationId_key" ON "public"."TextVectorizer"("id", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "TransaltionAdvisor_id_pluginInstallationId_key" ON "public"."TransaltionAdvisor"("id", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatableFileHandler_id_pluginInstallationId_key" ON "public"."TranslatableFileHandler"("id", "pluginInstallationId");

-- AddForeignKey
ALTER TABLE "public"."PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransaltionAdvisor" ADD CONSTRAINT "TransaltionAdvisor_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StorageProvider" ADD CONSTRAINT "StorageProvider_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthProvider" ADD CONSTRAINT "AuthProvider_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TermService" ADD CONSTRAINT "TermService_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslatableFileHandler" ADD CONSTRAINT "TranslatableFileHandler_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TextVectorizer" ADD CONSTRAINT "TextVectorizer_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

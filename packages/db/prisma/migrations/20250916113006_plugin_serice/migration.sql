/*
  Warnings:

  - You are about to drop the column `storageProviderId` on the `File` table. All the data in the column will be lost.
  - You are about to drop the `AuthProvider` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StorageProvider` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TermService` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TextVectorizer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TranslatableFileHandler` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TranslationAdvisor` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `pluginServiceId` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."ServiceType" AS ENUM ('TRANSLATION_ADVISOR', 'STORAGE_PROVIDER', 'AUTH_PROVIDER', 'TERM_SERVICE', 'TRANSLATABLE_FILE_HANDLER', 'TEXT_VECTORIZER');

-- DropForeignKey
ALTER TABLE "public"."AuthProvider" DROP CONSTRAINT "AuthProvider_pluginInstallationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."File" DROP CONSTRAINT "File_storageProviderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StorageProvider" DROP CONSTRAINT "StorageProvider_pluginInstallationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TermService" DROP CONSTRAINT "TermService_pluginInstallationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TextVectorizer" DROP CONSTRAINT "TextVectorizer_pluginInstallationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TranslatableFileHandler" DROP CONSTRAINT "TranslatableFileHandler_pluginInstallationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TranslationAdvisor" DROP CONSTRAINT "TranslationAdvisor_pluginInstallationId_fkey";

-- AlterTable
ALTER TABLE "public"."File" DROP COLUMN "storageProviderId",
ADD COLUMN     "pluginServiceId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "public"."AuthProvider";

-- DropTable
DROP TABLE "public"."StorageProvider";

-- DropTable
DROP TABLE "public"."TermService";

-- DropTable
DROP TABLE "public"."TextVectorizer";

-- DropTable
DROP TABLE "public"."TranslatableFileHandler";

-- DropTable
DROP TABLE "public"."TranslationAdvisor";

-- CreateTable
CREATE TABLE "public"."PluginService" (
    "id" SERIAL NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceType" "public"."ServiceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pluginInstallationId" INTEGER NOT NULL,

    CONSTRAINT "PluginService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PluginService_serviceId_pluginInstallationId_key" ON "public"."PluginService"("serviceId", "pluginInstallationId");

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_pluginServiceId_fkey" FOREIGN KEY ("pluginServiceId") REFERENCES "public"."PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PluginService" ADD CONSTRAINT "PluginService_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

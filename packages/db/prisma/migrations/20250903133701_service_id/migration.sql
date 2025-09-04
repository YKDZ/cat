/*
  Warnings:

  - The primary key for the `AuthProvider` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `AuthProvider` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `StorageProvider` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `StorageProvider` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `TermService` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `TermService` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `TextVectorizer` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `TextVectorizer` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `TranslatableFileHandler` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `TranslatableFileHandler` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `TranslationAdvisor` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `TranslationAdvisor` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[serviceId,pluginInstallationId]` on the table `AuthProvider` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[serviceId,pluginInstallationId]` on the table `StorageProvider` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[serviceId,pluginInstallationId]` on the table `TermService` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[serviceId,pluginInstallationId]` on the table `TextVectorizer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[serviceId,pluginInstallationId]` on the table `TranslatableFileHandler` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[serviceId,pluginInstallationId]` on the table `TranslationAdvisor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `serviceId` to the `AuthProvider` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `storageProviderId` on the `File` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `serviceId` to the `StorageProvider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceId` to the `TermService` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceId` to the `TextVectorizer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceId` to the `TranslatableFileHandler` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceId` to the `TranslationAdvisor` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."File" DROP CONSTRAINT "File_storageProviderId_fkey";

-- DropIndex
DROP INDEX "public"."AuthProvider_id_pluginInstallationId_key";

-- DropIndex
DROP INDEX "public"."StorageProvider_id_pluginInstallationId_key";

-- DropIndex
DROP INDEX "public"."TermService_id_pluginInstallationId_key";

-- DropIndex
DROP INDEX "public"."TextVectorizer_id_pluginInstallationId_key";

-- DropIndex
DROP INDEX "public"."TranslatableFileHandler_id_pluginInstallationId_key";

-- DropIndex
DROP INDEX "public"."TranslationAdvisor_id_pluginInstallationId_key";

-- AlterTable
ALTER TABLE "public"."AuthProvider" DROP CONSTRAINT "AuthProvider_pkey",
ADD COLUMN     "serviceId" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "AuthProvider_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."File" DROP COLUMN "storageProviderId",
ADD COLUMN     "storageProviderId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."StorageProvider" DROP CONSTRAINT "StorageProvider_pkey",
ADD COLUMN     "serviceId" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "StorageProvider_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."TermService" DROP CONSTRAINT "TermService_pkey",
ADD COLUMN     "serviceId" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "TermService_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."TextVectorizer" DROP CONSTRAINT "TextVectorizer_pkey",
ADD COLUMN     "serviceId" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "TextVectorizer_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."TranslatableFileHandler" DROP CONSTRAINT "TranslatableFileHandler_pkey",
ADD COLUMN     "serviceId" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "TranslatableFileHandler_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."TranslationAdvisor" DROP CONSTRAINT "TranslationAdvisor_pkey",
ADD COLUMN     "serviceId" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "TranslationAdvisor_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "AuthProvider_serviceId_pluginInstallationId_key" ON "public"."AuthProvider"("serviceId", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageProvider_serviceId_pluginInstallationId_key" ON "public"."StorageProvider"("serviceId", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "TermService_serviceId_pluginInstallationId_key" ON "public"."TermService"("serviceId", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "TextVectorizer_serviceId_pluginInstallationId_key" ON "public"."TextVectorizer"("serviceId", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatableFileHandler_serviceId_pluginInstallationId_key" ON "public"."TranslatableFileHandler"("serviceId", "pluginInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationAdvisor_serviceId_pluginInstallationId_key" ON "public"."TranslationAdvisor"("serviceId", "pluginInstallationId");

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_storageProviderId_fkey" FOREIGN KEY ("storageProviderId") REFERENCES "public"."StorageProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

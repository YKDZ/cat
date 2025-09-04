/*
  Warnings:

  - You are about to drop the column `storageTypeId` on the `File` table. All the data in the column will be lost.
  - You are about to drop the `StorageType` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `storageProviderId` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."File" DROP CONSTRAINT "File_storageTypeId_fkey";

-- AlterTable
ALTER TABLE "public"."File" DROP COLUMN "storageTypeId",
ADD COLUMN     "storageProviderId" TEXT NOT NULL;

-- DropTable
DROP TABLE "public"."StorageType";

-- CreateTable
CREATE TABLE "public"."TransaltionAdvisor" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,

    CONSTRAINT "TransaltionAdvisor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StorageProvider" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,

    CONSTRAINT "StorageProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuthProvider" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,

    CONSTRAINT "AuthProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TermService" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,

    CONSTRAINT "TermService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TranslatableFileHandler" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,

    CONSTRAINT "TranslatableFileHandler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TextVectorizer" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,

    CONSTRAINT "TextVectorizer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransaltionAdvisor_id_pluginId_key" ON "public"."TransaltionAdvisor"("id", "pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageProvider_id_pluginId_key" ON "public"."StorageProvider"("id", "pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthProvider_id_pluginId_key" ON "public"."AuthProvider"("id", "pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "TermService_id_pluginId_key" ON "public"."TermService"("id", "pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatableFileHandler_id_pluginId_key" ON "public"."TranslatableFileHandler"("id", "pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "TextVectorizer_id_pluginId_key" ON "public"."TextVectorizer"("id", "pluginId");

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_storageProviderId_fkey" FOREIGN KEY ("storageProviderId") REFERENCES "public"."StorageProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransaltionAdvisor" ADD CONSTRAINT "TransaltionAdvisor_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "public"."Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StorageProvider" ADD CONSTRAINT "StorageProvider_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "public"."Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthProvider" ADD CONSTRAINT "AuthProvider_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "public"."Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TermService" ADD CONSTRAINT "TermService_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "public"."Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslatableFileHandler" ADD CONSTRAINT "TranslatableFileHandler_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "public"."Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TextVectorizer" ADD CONSTRAINT "TextVectorizer_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "public"."Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

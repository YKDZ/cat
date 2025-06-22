/*
  Warnings:

  - You are about to drop the column `fileId` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `avatarFileId` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[documentId]` on the table `File` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `File` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_fileId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_avatarFileId_fkey";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "fileId";

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "avatarFileId";

-- CreateIndex
CREATE UNIQUE INDEX "File_documentId_key" ON "File"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "File_userId_key" ON "File"("userId");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

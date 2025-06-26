/*
  Warnings:

  - You are about to drop the column `currentVersionId` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `currentVersionDocumentId` on the `DocumentVersion` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_currentVersionId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentVersion" DROP CONSTRAINT "DocumentVersion_documentId_fkey";

-- DropIndex
DROP INDEX "Document_currentVersionId_key";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "currentVersionId";

-- AlterTable
ALTER TABLE "DocumentVersion" DROP COLUMN "currentVersionDocumentId",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

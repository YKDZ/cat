/*
  Warnings:

  - Added the required column `translationEmbeddingId` to the `MemoryItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_embeddingId_fkey";

-- AlterTable
ALTER TABLE "MemoryItem" ADD COLUMN     "translationEmbeddingId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Translation" ALTER COLUMN "embeddingId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translationEmbeddingId_fkey" FOREIGN KEY ("translationEmbeddingId") REFERENCES "Vector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_embeddingId_fkey" FOREIGN KEY ("embeddingId") REFERENCES "Vector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

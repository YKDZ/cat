/*
  Warnings:

  - Added the required column `embeddingId` to the `Translation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "embeddingId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_embeddingId_fkey" FOREIGN KEY ("embeddingId") REFERENCES "Vector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

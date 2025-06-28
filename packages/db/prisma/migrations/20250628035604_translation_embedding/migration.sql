/*
  Warnings:

  - Made the column `embeddingId` on table `Translation` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_embeddingId_fkey";

-- AlterTable
ALTER TABLE "Translation" ALTER COLUMN "embeddingId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_embeddingId_fkey" FOREIGN KEY ("embeddingId") REFERENCES "Vector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

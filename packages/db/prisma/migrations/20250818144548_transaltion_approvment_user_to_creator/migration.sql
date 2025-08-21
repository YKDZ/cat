/*
  Warnings:

  - You are about to drop the column `userId` on the `TranslationApprovment` table. All the data in the column will be lost.
  - Added the required column `creatorId` to the `TranslationApprovment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."TranslationApprovment" DROP CONSTRAINT "TranslationApprovment_userId_fkey";

-- AlterTable
ALTER TABLE "public"."TranslationApprovment" DROP COLUMN "userId",
ADD COLUMN     "creatorId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."TranslationApprovment" ADD CONSTRAINT "TranslationApprovment_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

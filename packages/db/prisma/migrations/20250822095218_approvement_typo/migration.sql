/*
  Warnings:

  - You are about to drop the `TranslationApprovment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."TranslationApprovment" DROP CONSTRAINT "TranslationApprovment_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TranslationApprovment" DROP CONSTRAINT "TranslationApprovment_translationId_fkey";

-- DropTable
DROP TABLE "public"."TranslationApprovment";

-- CreateTable
CREATE TABLE "public"."TranslationApprovement" (
    "id" SERIAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "translationId" INTEGER NOT NULL,
    "creatorId" TEXT NOT NULL,

    CONSTRAINT "TranslationApprovement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."TranslationApprovement" ADD CONSTRAINT "TranslationApprovement_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "public"."Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslationApprovement" ADD CONSTRAINT "TranslationApprovement_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

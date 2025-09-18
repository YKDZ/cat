/*
  Warnings:

  - Added the required column `projectId` to the `TranslatableElement` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."TranslatableElement" DROP CONSTRAINT "TranslatableElement_documentVersionId_fkey";

-- AlterTable
ALTER TABLE "public"."TranslatableElement" ADD COLUMN     "creatorId" TEXT,
ADD COLUMN     "projectId" TEXT NOT NULL,
ALTER COLUMN "documentId" DROP NOT NULL,
ALTER COLUMN "documentVersionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."TranslatableElement" ADD CONSTRAINT "TranslatableElement_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "public"."DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslatableElement" ADD CONSTRAINT "TranslatableElement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslatableElement" ADD CONSTRAINT "TranslatableElement_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

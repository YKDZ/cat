-- DropForeignKey
ALTER TABLE "public"."TranslatableElement" DROP CONSTRAINT "TranslatableElement_projectId_fkey";

-- AlterTable
ALTER TABLE "public"."TranslatableElement" ALTER COLUMN "projectId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."TranslatableElement" ADD CONSTRAINT "TranslatableElement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

/*
  Warnings:

  - Made the column `userId` on table `TranslationApprovment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."TranslationApprovment" ALTER COLUMN "userId" SET NOT NULL;

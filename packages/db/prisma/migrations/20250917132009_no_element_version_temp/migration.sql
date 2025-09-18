/*
  Warnings:

  - You are about to drop the column `isActive` on the `TranslatableElement` table. All the data in the column will be lost.
  - You are about to drop the column `previousVersionId` on the `TranslatableElement` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `TranslatableElement` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."TranslatableElement" DROP CONSTRAINT "TranslatableElement_previousVersionId_fkey";

-- DropIndex
DROP INDEX "public"."TranslatableElement_previousVersionId_key";

-- AlterTable
ALTER TABLE "public"."TranslatableElement" DROP COLUMN "isActive",
DROP COLUMN "previousVersionId",
DROP COLUMN "version";

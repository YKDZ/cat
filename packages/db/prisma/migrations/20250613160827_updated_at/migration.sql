/*
  Warnings:

  - A unique constraint covering the columns `[meta,documentId,isActive]` on the table `TranslatableElement` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "TranslatableElement" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

/*
  Warnings:

  - Added the required column `sortIndex` to the `TranslatableElement` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TranslatableElement" ADD COLUMN     "sortIndex" INTEGER NOT NULL;

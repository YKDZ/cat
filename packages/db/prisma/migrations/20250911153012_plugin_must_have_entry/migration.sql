/*
  Warnings:

  - Made the column `entry` on table `Plugin` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Plugin" ALTER COLUMN "entry" SET NOT NULL;

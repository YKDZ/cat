/*
  Warnings:

  - Made the column `scopeId` on table `PluginConfigInstance` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "PluginConfigInstance" ALTER COLUMN "scopeId" SET NOT NULL;

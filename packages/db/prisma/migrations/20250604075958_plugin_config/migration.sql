/*
  Warnings:

  - Added the required column `type` to the `PluginConfig` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PluginConfig" ADD COLUMN     "type" TEXT NOT NULL;

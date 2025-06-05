/*
  Warnings:

  - Added the required column `default` to the `PluginConfig` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PluginConfig" ADD COLUMN     "default" JSONB NOT NULL;

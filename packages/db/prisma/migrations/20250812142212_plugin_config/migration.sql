/*
  Warnings:

  - You are about to drop the column `userOverridable` on the `PluginConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PluginConfig" DROP COLUMN "userOverridable",
ADD COLUMN     "overridable" BOOLEAN NOT NULL DEFAULT false;

/*
  Warnings:

  - You are about to drop the `PluginComponent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."PluginComponent" DROP CONSTRAINT "PluginComponent_pluginId_fkey";

-- DropTable
DROP TABLE "public"."PluginComponent";

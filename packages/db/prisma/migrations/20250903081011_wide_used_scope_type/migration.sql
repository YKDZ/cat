/*
  Warnings:

  - A unique constraint covering the columns `[scopeId,scopeType,pluginId]` on the table `PluginInstallation` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `scopeType` on the `PluginConfigInstance` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `scopeType` to the `PluginInstallation` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."ScopeType" AS ENUM ('GLOBAL', 'USER', 'PROJECT');

-- DropIndex
DROP INDEX "public"."PluginInstallation_scopeId_pluginId_key";

-- AlterTable
ALTER TABLE "public"."PluginConfigInstance" DROP COLUMN "scopeType",
ADD COLUMN     "scopeType" "public"."ScopeType" NOT NULL;

-- AlterTable
ALTER TABLE "public"."PluginInstallation" ADD COLUMN     "scopeMeta" JSONB,
ADD COLUMN     "scopeType" "public"."ScopeType" NOT NULL;

-- DropEnum
DROP TYPE "public"."PluginConfigInstanceScopeType";

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfigInstance_configId_scopeType_scopeId_key" ON "public"."PluginConfigInstance"("configId", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginInstallation_scopeId_scopeType_pluginId_key" ON "public"."PluginInstallation"("scopeId", "scopeType", "pluginId");

/*
  Warnings:

  - Changed the type of `scopeType` on the `PluginConfigInstance` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."PluginConfigInstanceScopeType" AS ENUM ('GLOBAL', 'USER', 'PROJECT');

-- AlterTable
ALTER TABLE "public"."PluginConfigInstance" DROP COLUMN "scopeType",
ADD COLUMN     "scopeType" "public"."PluginConfigInstanceScopeType" NOT NULL;

-- DropEnum
DROP TYPE "public"."PluginConfigInstatnceScopeType";

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfigInstance_configId_scopeType_scopeId_key" ON "public"."PluginConfigInstance"("configId", "scopeType", "scopeId");

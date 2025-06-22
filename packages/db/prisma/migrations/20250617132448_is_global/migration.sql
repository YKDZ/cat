-- DropIndex
DROP INDEX "PluginConfigInstance_creatorId_configId_key";

-- AlterTable
ALTER TABLE "PluginConfigInstance" ADD COLUMN     "isGlobal" BOOLEAN NOT NULL DEFAULT false;

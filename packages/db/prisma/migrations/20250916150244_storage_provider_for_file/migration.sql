/*
  Warnings:

  - You are about to drop the column `pluginServiceId` on the `File` table. All the data in the column will be lost.
  - Added the required column `storageProviderId` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."File" DROP CONSTRAINT "File_pluginServiceId_fkey";

-- AlterTable
ALTER TABLE "public"."File" DROP COLUMN "pluginServiceId",
ADD COLUMN     "storageProviderId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_storageProviderId_fkey" FOREIGN KEY ("storageProviderId") REFERENCES "public"."PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

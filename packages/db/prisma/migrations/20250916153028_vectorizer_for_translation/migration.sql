/*
  Warnings:

  - Added the required column `vectorizerId` to the `Translation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Translation" ADD COLUMN     "vectorizerId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Translation" ADD CONSTRAINT "Translation_vectorizerId_fkey" FOREIGN KEY ("vectorizerId") REFERENCES "public"."PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

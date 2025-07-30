/*
  Warnings:

  - You are about to drop the column `typeId` on the `File` table. All the data in the column will be lost.
  - You are about to drop the `FileType` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "File" DROP CONSTRAINT "File_typeId_fkey";

-- AlterTable
ALTER TABLE "File" DROP COLUMN "typeId";

-- DropTable
DROP TABLE "FileType";

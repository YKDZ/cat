/*
  Warnings:

  - You are about to drop the column `permission` on the `Permission` table. All the data in the column will be lost.
  - The primary key for the `UserRole` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `_PermissionToRole` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `action` to the `Permission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `resource` to the `Permission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Permission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `UserRole` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "_PermissionToRole" DROP CONSTRAINT "_PermissionToRole_A_fkey";

-- DropForeignKey
ALTER TABLE "_PermissionToRole" DROP CONSTRAINT "_PermissionToRole_B_fkey";

-- AlterTable
ALTER TABLE "Permission" DROP COLUMN "permission",
ADD COLUMN     "action" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "resource" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "parentId" INTEGER,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_pkey",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "scope" DROP NOT NULL,
ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "_PermissionToRole";

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

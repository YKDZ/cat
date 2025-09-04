/*
  Warnings:

  - You are about to drop the `TransaltionAdvisor` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."TransaltionAdvisor" DROP CONSTRAINT "TransaltionAdvisor_pluginInstallationId_fkey";

-- DropTable
DROP TABLE "public"."TransaltionAdvisor";

-- CreateTable
CREATE TABLE "public"."TranslationAdvisor" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pluginInstallationId" INTEGER NOT NULL,

    CONSTRAINT "TranslationAdvisor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranslationAdvisor_id_pluginInstallationId_key" ON "public"."TranslationAdvisor"("id", "pluginInstallationId");

-- AddForeignKey
ALTER TABLE "public"."TranslationAdvisor" ADD CONSTRAINT "TranslationAdvisor_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "public"."PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

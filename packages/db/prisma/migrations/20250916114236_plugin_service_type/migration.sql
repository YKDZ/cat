/*
  Warnings:

  - Changed the type of `serviceType` on the `PluginService` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."PluginServiceType" AS ENUM ('TRANSLATION_ADVISOR', 'STORAGE_PROVIDER', 'AUTH_PROVIDER', 'TERM_SERVICE', 'TRANSLATABLE_FILE_HANDLER', 'TEXT_VECTORIZER');

-- AlterTable
ALTER TABLE "public"."PluginService" DROP COLUMN "serviceType",
ADD COLUMN     "serviceType" "public"."PluginServiceType" NOT NULL;

-- DropEnum
DROP TYPE "public"."ServiceType";

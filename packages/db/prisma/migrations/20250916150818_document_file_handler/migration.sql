-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN     "fileHandlerId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_fileHandlerId_fkey" FOREIGN KEY ("fileHandlerId") REFERENCES "public"."PluginService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

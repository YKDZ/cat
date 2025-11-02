ALTER TABLE "File" DROP CONSTRAINT "File_document_id_Document_id_fk";
--> statement-breakpoint
ALTER TABLE "File" DROP CONSTRAINT "File_creator_id_User_id_fk";
--> statement-breakpoint
ALTER TABLE "Document" ADD COLUMN "file_id" integer;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "avatar_file_id" integer;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_id_File_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."File"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_avatar_file_id_File_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."File"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "File" DROP COLUMN "document_id";--> statement-breakpoint
ALTER TABLE "File" DROP COLUMN "creator_id";
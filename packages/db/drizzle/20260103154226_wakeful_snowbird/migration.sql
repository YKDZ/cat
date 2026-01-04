CREATE TABLE "TranslationSnapshot" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"creator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslationSnapshotItem" (
	"id" serial PRIMARY KEY,
	"snapshot_id" integer NOT NULL,
	"translation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TranslationSnapshot" ADD CONSTRAINT "TranslationSnapshot_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationSnapshot" ADD CONSTRAINT "TranslationSnapshot_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationSnapshotItem" ADD CONSTRAINT "TranslationSnapshotItem_snapshot_id_TranslationSnapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "TranslationSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationSnapshotItem" ADD CONSTRAINT "TranslationSnapshotItem_translation_id_Translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
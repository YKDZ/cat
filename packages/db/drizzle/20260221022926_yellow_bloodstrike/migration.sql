CREATE TABLE "TermConceptSubject" (
	"id" serial PRIMARY KEY,
	"subject" text NOT NULL,
	"creator_id" uuid,
	"glossary_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TermConcept" RENAME COLUMN "subject" TO "definition";--> statement-breakpoint
ALTER TABLE "TermConcept" ADD COLUMN "subject_id" integer;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD COLUMN "creator_id" uuid;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD CONSTRAINT "TermConcept_subject_id_TermConceptSubject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "TermConceptSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD CONSTRAINT "TermConcept_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConceptSubject" ADD CONSTRAINT "TermConceptSubject_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConceptSubject" ADD CONSTRAINT "TermConceptSubject_glossary_id_Glossary_id_fkey" FOREIGN KEY ("glossary_id") REFERENCES "Glossary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
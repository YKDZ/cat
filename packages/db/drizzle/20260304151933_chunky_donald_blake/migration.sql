CREATE TABLE "TermConceptToSubject" (
	"term_concept_id" integer,
	"subject_id" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "TermConceptToSubject_pkey" PRIMARY KEY("term_concept_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "Term" DROP CONSTRAINT "Term_string_id_TranslatableString_id_fkey";--> statement-breakpoint
ALTER TABLE "TermConcept" DROP CONSTRAINT "TermConcept_subject_id_TermConceptSubject_id_fkey";--> statement-breakpoint
ALTER TABLE "Term" ADD COLUMN "text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "Term" ADD COLUMN "language_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD COLUMN "string_id" integer;--> statement-breakpoint
ALTER TABLE "Term" DROP COLUMN "string_id";--> statement-breakpoint
ALTER TABLE "TermConcept" DROP COLUMN "subject_id";--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_language_id_text_term_concept_id_unique" UNIQUE("language_id","text","term_concept_id");--> statement-breakpoint
CREATE INDEX "idx_term_text_trgm" ON "Term" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD CONSTRAINT "TermConcept_string_id_TranslatableString_id_fkey" FOREIGN KEY ("string_id") REFERENCES "TranslatableString"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConceptToSubject" ADD CONSTRAINT "TermConceptToSubject_term_concept_id_TermConcept_id_fkey" FOREIGN KEY ("term_concept_id") REFERENCES "TermConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConceptToSubject" ADD CONSTRAINT "TermConceptToSubject_subject_id_TermConceptSubject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "TermConceptSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
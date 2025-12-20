CREATE TABLE "TermConcept" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"glossary_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Term" DROP CONSTRAINT "Term_glossary_id_Glossary_id_fkey";--> statement-breakpoint
DROP TABLE "TermRelation";--> statement-breakpoint
ALTER TABLE "Term" ADD COLUMN "term_concept_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_term_concept_id_TermConcept_id_fkey" FOREIGN KEY ("term_concept_id") REFERENCES "TermConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD CONSTRAINT "TermConcept_glossary_id_Glossary_id_fkey" FOREIGN KEY ("glossary_id") REFERENCES "Glossary"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Term" DROP COLUMN "glossary_id";
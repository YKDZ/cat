ALTER TABLE "TermConcept" RENAME TO "TermEntry";--> statement-breakpoint
ALTER TABLE "Term" RENAME COLUMN "term_concept_id" TO "term_entry_id";
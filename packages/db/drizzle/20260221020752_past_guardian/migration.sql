CREATE TYPE "TermStatus" AS ENUM('NOT_SPECIFIED', 'PREFERRED', 'ADMITTED', 'NOT_RECOMMENDED', 'OBSOLETE');--> statement-breakpoint
CREATE TYPE "TermType" AS ENUM('NOT_SPECIFIED', 'FULL_FORM', 'ACRONYM', 'ABBREVIATION', 'SHORT_FORM', 'VARIANT', 'PHRASE');--> statement-breakpoint
ALTER TABLE "TermEntry" RENAME TO "TermConcept";--> statement-breakpoint
ALTER TABLE "Term" RENAME COLUMN "term_entry_id" TO "term_concept_id";--> statement-breakpoint
ALTER TABLE "Term" ADD COLUMN "type" "TermType" DEFAULT 'NOT_SPECIFIED'::"TermType" NOT NULL;--> statement-breakpoint
ALTER TABLE "Term" ADD COLUMN "status" "TermStatus" DEFAULT 'NOT_SPECIFIED'::"TermStatus" NOT NULL;--> statement-breakpoint
ALTER TABLE "TermConcept" ALTER COLUMN "subject" SET DEFAULT '';
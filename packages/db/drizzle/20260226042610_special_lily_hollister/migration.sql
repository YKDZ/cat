ALTER TABLE "TermConcept" ALTER COLUMN "definition" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "TermConcept" ALTER COLUMN "definition" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "TermConceptSubject" ALTER COLUMN "default_definition" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "TermConceptSubject" ALTER COLUMN "default_definition" DROP NOT NULL;
ALTER TABLE "TermRelation" DROP CONSTRAINT "TermRelation_term_id_Term_id_fk";
--> statement-breakpoint
ALTER TABLE "TermRelation" DROP CONSTRAINT "TermRelation_translation_id_Term_id_fk";
--> statement-breakpoint
ALTER TABLE "TermRelation" ADD CONSTRAINT "TermRelation_term_id_Term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."Term"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TermRelation" ADD CONSTRAINT "TermRelation_translation_id_Term_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."Term"("id") ON DELETE restrict ON UPDATE cascade;
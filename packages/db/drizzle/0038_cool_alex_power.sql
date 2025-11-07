CREATE TABLE "DocumentClosure" (
	"ancestor" uuid NOT NULL,
	"descendant" uuid NOT NULL,
	"depth" integer NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "DocumentClosure_ancestor_descendant_pk" PRIMARY KEY("ancestor","descendant")
);
--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_ancestor_Document_id_fk" FOREIGN KEY ("ancestor") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_descendant_Document_id_fk" FOREIGN KEY ("descendant") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "DocumentClosure_ancestor_index" ON "DocumentClosure" USING btree ("ancestor");--> statement-breakpoint
CREATE INDEX "DocumentClosure_descendant_index" ON "DocumentClosure" USING btree ("descendant");
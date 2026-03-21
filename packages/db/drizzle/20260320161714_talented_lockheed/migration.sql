ALTER TYPE "AgentDefinitionType" ADD VALUE 'WORKFLOW';--> statement-breakpoint
ALTER TABLE "AgentSession" ADD COLUMN "project_id" uuid;--> statement-breakpoint
CREATE INDEX "AgentSession_project_id_index" ON "AgentSession" ("project_id");--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
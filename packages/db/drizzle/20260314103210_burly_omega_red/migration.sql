ALTER TABLE "AgentToolCall" DROP CONSTRAINT "AgentToolCall_message_id_AgentMessage_id_fkey";--> statement-breakpoint
DROP TABLE "AgentMessage";--> statement-breakpoint
DROP TABLE "AgentToolCall";--> statement-breakpoint
ALTER TABLE "AgentRun" ADD COLUMN "deduplication_key" text;--> statement-breakpoint
CREATE INDEX "AgentRun_deduplication_key_index" ON "AgentRun" ("deduplication_key");--> statement-breakpoint
DROP TYPE "AgentMessageRole";
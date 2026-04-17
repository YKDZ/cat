ALTER TABLE "Changeset" DROP CONSTRAINT "Changeset_linked_card_id_KanbanCard_id_fkey";--> statement-breakpoint
ALTER TABLE "KanbanCard" DROP CONSTRAINT "KanbanCard_board_id_KanbanBoard_id_fkey";--> statement-breakpoint
ALTER TABLE "KanbanCardDep" DROP CONSTRAINT "KanbanCardDep_card_id_KanbanCard_id_fkey";--> statement-breakpoint
ALTER TABLE "KanbanCardDep" DROP CONSTRAINT "KanbanCardDep_depends_on_card_id_KanbanCard_id_fkey";--> statement-breakpoint
DROP TABLE "KanbanBoard";--> statement-breakpoint
DROP TABLE "KanbanCard";--> statement-breakpoint
DROP TABLE "KanbanCardDep";--> statement-breakpoint
ALTER TABLE "AuthAuditLog" ALTER COLUMN "object_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "PermissionTuple" ALTER COLUMN "object_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "ObjectType";--> statement-breakpoint
CREATE TYPE "ObjectType" AS ENUM('system', 'project', 'document', 'element', 'glossary', 'memory', 'term', 'translation', 'comment', 'plugin', 'setting', 'task', 'agent_definition', 'user');--> statement-breakpoint
ALTER TABLE "AuthAuditLog" ALTER COLUMN "object_type" SET DATA TYPE "ObjectType" USING "object_type"::"ObjectType";--> statement-breakpoint
ALTER TABLE "PermissionTuple" ALTER COLUMN "object_type" SET DATA TYPE "ObjectType" USING "object_type"::"ObjectType";--> statement-breakpoint
ALTER TABLE "AgentSession" DROP COLUMN "kanban_card_id";--> statement-breakpoint
ALTER TABLE "Changeset" DROP COLUMN "linked_card_id";--> statement-breakpoint
DROP TYPE "KanbanCardStatus";
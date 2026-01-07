CREATE TYPE "CommentTargetType" AS ENUM('TRANSLATION', 'ELEMENT');--> statement-breakpoint
ALTER TYPE "TranslatableElementCommentReactionType" RENAME TO "CommentReactionType";--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" RENAME TO "Comment";--> statement-breakpoint
ALTER TABLE "TranslatableElementCommentReaction" RENAME TO "CommentReaction";--> statement-breakpoint
ALTER TABLE "Comment" DROP CONSTRAINT "TranslatableElementComment_XcPkwxltYBq7_fkey";--> statement-breakpoint
ALTER TABLE "CommentReaction" RENAME COLUMN "translatable_element_comment_id" TO "comment_id";--> statement-breakpoint
ALTER INDEX "TranslatableElementComment_translatable_element_id_index" RENAME TO "Comment_target_type_target_id_index";--> statement-breakpoint
ALTER TABLE "Comment" ADD COLUMN "target_type" "CommentTargetType" NOT NULL;--> statement-breakpoint
ALTER TABLE "Comment" ADD COLUMN "target_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Comment" DROP COLUMN "translatable_element_id";--> statement-breakpoint
CREATE INDEX "Comment_target_type_target_id_index" ON "Comment" ("target_type","target_id");
CREATE TYPE "public"."TranslatableElementCommentReactionType" AS ENUM('+1', '-1', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART', 'ROCKET', 'EYES');--> statement-breakpoint
CREATE TABLE "TranslatableElementCommentReaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"translatable_element_comment_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "TranslatableElementCommentReactionType" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "TranslatableElementCommentReaction_translatableElementCommentId_userId_unique" UNIQUE("translatable_element_comment_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "TranslatableElementCommentReaction" ADD CONSTRAINT "TranslatableElementCommentReaction_translatable_element_comment_id_TranslatableElementComment_id_fk" FOREIGN KEY ("translatable_element_comment_id") REFERENCES "public"."TranslatableElementComment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElementCommentReaction" ADD CONSTRAINT "TranslatableElementCommentReaction_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "TranslatableElementCommentReaction_translatable_element_comment_id_index" ON "TranslatableElementCommentReaction" USING btree ("translatable_element_comment_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementCommentReaction_user_id_index" ON "TranslatableElementCommentReaction" USING btree ("user_id");
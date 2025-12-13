DROP INDEX "User_email_index";--> statement-breakpoint
DROP INDEX "User_name_index";--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_email_name_unique" UNIQUE("email","name");
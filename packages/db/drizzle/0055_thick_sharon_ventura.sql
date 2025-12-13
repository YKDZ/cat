CREATE TABLE "PermissionTemplate" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"resource_type" "ResourceType" NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "PermissionTemplate_content_unique" UNIQUE("content")
);
--> statement-breakpoint
ALTER TABLE "Permission" DROP CONSTRAINT "Permission_content_unique";--> statement-breakpoint
ALTER TABLE "Permission" ADD COLUMN "template_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_template_id_PermissionTemplate_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."PermissionTemplate"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Permission" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "Permission" DROP COLUMN "resource_type";--> statement-breakpoint
ALTER TABLE "Permission" DROP COLUMN "resource_id";--> statement-breakpoint
ALTER TABLE "Permission" DROP COLUMN "meta";
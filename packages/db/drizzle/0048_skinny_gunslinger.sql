CREATE TABLE "Permission" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Permission_content_unique" UNIQUE("content")
);
--> statement-breakpoint
CREATE TABLE "Role" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope_type" "ScopeType" NOT NULL,
	"scope_id" uuid,
	"name" text NOT NULL,
	"creator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RolePermission" (
	"role_id" serial NOT NULL,
	"permission_id" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "UserRole" (
	"user_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Role" ADD CONSTRAINT "Role_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_role_id_Role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."Role"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permission_id_Permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."Permission"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_role_id_Role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."Role"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;
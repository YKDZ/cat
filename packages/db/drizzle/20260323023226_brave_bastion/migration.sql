CREATE TYPE "ObjectType" AS ENUM('system', 'project', 'document', 'element', 'glossary', 'memory', 'term', 'translation', 'comment', 'plugin', 'setting', 'task', 'agent_definition', 'user');--> statement-breakpoint
CREATE TYPE "PermissionAction" AS ENUM('check', 'grant', 'revoke');--> statement-breakpoint
CREATE TYPE "Relation" AS ENUM('superadmin', 'admin', 'owner', 'editor', 'viewer', 'member');--> statement-breakpoint
CREATE TYPE "SubjectType" AS ENUM('user', 'role', 'agent');--> statement-breakpoint
CREATE TABLE "AuthAuditLog" (
	"id" serial PRIMARY KEY,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"subject_type" "SubjectType" NOT NULL,
	"subject_id" text NOT NULL,
	"action" "PermissionAction" NOT NULL,
	"object_type" "ObjectType" NOT NULL,
	"object_id" text NOT NULL,
	"relation" "Relation" NOT NULL,
	"result" boolean NOT NULL,
	"trace_id" text,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "PermissionTuple" (
	"id" serial PRIMARY KEY,
	"subject_type" "SubjectType" NOT NULL,
	"subject_id" text NOT NULL,
	"relation" "Relation" NOT NULL,
	"object_type" "ObjectType" NOT NULL,
	"object_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "PermissionTuple_subject_type_subject_id_relation_object_type_object_id_unique" UNIQUE("subject_type","subject_id","relation","object_type","object_id")
);
--> statement-breakpoint
CREATE TABLE "Role" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "UserRole" (
	"id" serial PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "UserRole_user_id_role_id_unique" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE INDEX "idx_pt_subject" ON "PermissionTuple" ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_pt_object" ON "PermissionTuple" ("object_type","object_id");--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_role_id_Role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE CASCADE;
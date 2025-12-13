ALTER TABLE "RolePermission" ALTER COLUMN "role_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "RolePermission" ALTER COLUMN "permission_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id");--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_user_id_role_id_pk" PRIMARY KEY("user_id","role_id");
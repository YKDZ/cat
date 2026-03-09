ALTER TABLE "Permission" DROP CONSTRAINT "Permission_template_id_PermissionTemplate_id_fkey";--> statement-breakpoint
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_role_id_Role_id_fkey";--> statement-breakpoint
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_permission_id_Permission_id_fkey";--> statement-breakpoint
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_role_id_Role_id_fkey";--> statement-breakpoint
DROP TABLE "Permission";--> statement-breakpoint
DROP TABLE "PermissionTemplate";--> statement-breakpoint
DROP TABLE "Role";--> statement-breakpoint
DROP TABLE "RolePermission";--> statement-breakpoint
DROP TABLE "UserRole";
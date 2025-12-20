ALTER TYPE "PluginServiceType" ADD VALUE 'MFA_PROVIDER' BEFORE 'STORAGE_PROVIDER';--> statement-breakpoint
DROP INDEX "Account_user_id_provider_index";--> statement-breakpoint
ALTER TABLE "Account" DROP CONSTRAINT "Account_pkey";
ALTER TABLE "Account" ADD COLUMN "id" serial PRIMARY KEY;--> statement-breakpoint
ALTER TABLE "Account" ADD COLUMN "provider_issuer" text NOT NULL;--> statement-breakpoint
ALTER TABLE "Account" ADD COLUMN "auth_provider_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_auth_provider_id_PluginService_id_fkey" FOREIGN KEY ("auth_provider_id") REFERENCES "PluginService"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Account" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "Account" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "Account" DROP CONSTRAINT "Account_pkey";--> statement-breakpoint
ALTER TABLE "Account" ADD PRIMARY KEY ("id");
CREATE TYPE "AgentSessionTrustPolicy" AS ENUM('CONFIRM_ALL', 'TRUST_SESSION');--> statement-breakpoint
CREATE TYPE "AgentToolConfirmationStatus" AS ENUM('AUTO_ALLOWED', 'USER_APPROVED', 'USER_DENIED');--> statement-breakpoint
CREATE TYPE "AgentToolTarget" AS ENUM('SERVER', 'CLIENT');--> statement-breakpoint
ALTER TYPE "PluginServiceType" ADD VALUE 'AGENT_TOOL_PROVIDER';--> statement-breakpoint
ALTER TABLE "AgentSession" ADD COLUMN "trust_policy" "AgentSessionTrustPolicy" DEFAULT 'CONFIRM_ALL'::"AgentSessionTrustPolicy" NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentToolCall" ADD COLUMN "target" "AgentToolTarget" DEFAULT 'SERVER'::"AgentToolTarget" NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentToolCall" ADD COLUMN "confirmation_status" "AgentToolConfirmationStatus";
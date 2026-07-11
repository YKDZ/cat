ALTER TABLE "Task" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
DROP TYPE "TaskStatus";--> statement-breakpoint
CREATE TYPE "TaskStatus" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELED');--> statement-breakpoint
ALTER TABLE "Task" ALTER COLUMN "status" SET DATA TYPE "TaskStatus" USING "status"::"TaskStatus";--> statement-breakpoint
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"TaskStatus";

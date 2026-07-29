CREATE TABLE "BootstrapReceipt" (
	"id" serial PRIMARY KEY,
	"idempotency_key" text NOT NULL UNIQUE,
	"plan_version" text NOT NULL,
	"input_digest" text NOT NULL,
	"schema_digest" text NOT NULL,
	"plugin_digest" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

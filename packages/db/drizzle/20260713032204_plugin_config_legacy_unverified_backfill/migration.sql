-- Existing rows were created before schema identity was recorded. They remain
-- intentionally stale until discovery records a verified definition and an
-- operator performs the explicit migration flow.
UPDATE "PluginConfig"
SET "schema_version" = 'legacy-unverified', "schema_digest" = ''
WHERE "schema_digest" = '';
--> statement-breakpoint
UPDATE "PluginConfigInstance"
SET "applied_version" = 'legacy-unverified'
WHERE "applied_version" = '1';

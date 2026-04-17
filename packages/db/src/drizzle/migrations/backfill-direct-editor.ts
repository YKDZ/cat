import { sql } from "drizzle-orm";

import type { DrizzleClient, DrizzleTransaction } from "../db.ts";

type DbHandle = DrizzleClient | DrizzleTransaction;

/**
 * One-time migration: grant direct_editor to all existing project editor/admin/owner subjects.
 * This preserves the previous trust-by-default behaviour for existing projects.
 */
export async function backfillDirectEditor(db: DbHandle): Promise<void> {
  await db.execute(sql`
    INSERT INTO "PermissionTuple" ("subject_type", "subject_id", "relation", "object_type", "object_id", "created_at", "updated_at")
    SELECT "subject_type", "subject_id", 'direct_editor', "object_type", "object_id", NOW(), NOW()
    FROM "PermissionTuple"
    WHERE "object_type" = 'project'
      AND "relation" IN ('editor', 'admin', 'owner')
    ON CONFLICT DO NOTHING
  `);
}

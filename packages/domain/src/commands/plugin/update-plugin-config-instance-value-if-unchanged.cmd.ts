import { and, eq, pluginConfigInstance, sql } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

/**
 * Command input schema for updating a config instance value only when the updated timestamp is unchanged.
 */
export const UpdatePluginConfigInstanceValueIfUnchangedCommandSchema = z.object(
  {
    instanceId: z.int(),
    value: nonNullSafeZDotJson,
    expectedUpdatedAt: z.date(),
  },
);

/**
 * Command payload for updating a config instance value only when the version is unchanged.
 */
export type UpdatePluginConfigInstanceValueIfUnchangedCommand = z.infer<
  typeof UpdatePluginConfigInstanceValueIfUnchangedCommandSchema
>;

/**
 * Update a plugin config instance value only when its version is unchanged.
 *
 * @param ctx - Database context
 * @param command - Update condition and value
 * @returns - Updated config instance, or null on version conflict
 */
export const updatePluginConfigInstanceValueIfUnchanged: Command<
  UpdatePluginConfigInstanceValueIfUnchangedCommand,
  typeof pluginConfigInstance.$inferSelect | null
> = async (ctx, command) => {
  const now = new Date(
    Math.max(Date.now(), command.expectedUpdatedAt.getTime() + 1),
  );
  const updated = await ctx.db
    .update(pluginConfigInstance)
    .set({ value: command.value, updatedAt: now })
    .where(
      and(
        eq(pluginConfigInstance.id, command.instanceId),
        sql`date_trunc('milliseconds', ${pluginConfigInstance.updatedAt}) = date_trunc('milliseconds', ${command.expectedUpdatedAt}::timestamptz)`,
      ),
    )
    .returning();

  return { result: updated[0] ?? null, events: [] };
};

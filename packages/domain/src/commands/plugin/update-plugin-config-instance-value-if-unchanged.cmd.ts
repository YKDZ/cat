import { and, eq, pluginConfigInstance, sql } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

/**
 * @zh 仅当配置实例的更新时间未变化时更新配置值的命令入参 Schema。
 * @en Command input schema for updating a config instance value only when the updated timestamp is unchanged.
 */
export const UpdatePluginConfigInstanceValueIfUnchangedCommandSchema = z.object(
  {
    instanceId: z.int(),
    value: nonNullSafeZDotJson,
    expectedUpdatedAt: z.date(),
  },
);

/**
 * @zh 仅当配置实例版本未变化时更新配置值的命令入参。
 * @en Command payload for updating a config instance value only when the version is unchanged.
 */
export type UpdatePluginConfigInstanceValueIfUnchangedCommand = z.infer<
  typeof UpdatePluginConfigInstanceValueIfUnchangedCommandSchema
>;

/**
 * @zh 仅当配置实例版本未变化时更新配置值。
 * @en Update a plugin config instance value only when its version is unchanged.
 *
 * @param ctx - {@zh 数据库上下文} {@en Database context}
 * @param command - {@zh 更新条件和值} {@en Update condition and value}
 * @returns - {@zh 更新后的配置实例，若版本冲突则为 null} {@en Updated config instance, or null on version conflict}
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

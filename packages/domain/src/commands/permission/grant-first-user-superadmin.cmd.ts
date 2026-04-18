import { eq, permissionTuple, setting } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

const FIRST_USER_SETTING_KEY = "system:first_user_registered";

export const GrantFirstUserSuperadminCommandSchema = z.object({
  userId: z.string(),
});

export type GrantFirstUserSuperadminCommand = z.infer<
  typeof GrantFirstUserSuperadminCommandSchema
>;

/**
 * 检查是否为首位注册用户：若是，自动授予 system#superadmin 权限元组，
 * 并将 setting "system:first_user_registered" 置为 true。
 *
 * 性能优化：只查一次 setting（O(1)），不走 count(*)。
 * 幂等：若 setting 已存在则直接返回。
 */
export const grantFirstUserSuperadmin: Command<
  GrantFirstUserSuperadminCommand
> = async (ctx, command) => {
  const existingSetting = await ctx.db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, FIRST_USER_SETTING_KEY))
    .limit(1);

  if (existingSetting.length > 0) {
    return { result: undefined, events: [] };
  }

  await ctx.db
    .insert(permissionTuple)
    .values({
      subjectType: "user",
      subjectId: command.userId,
      relation: "superadmin",
      objectType: "system",
      objectId: "*",
    })
    .onConflictDoNothing();

  await ctx.db
    .insert(setting)
    .values({
      key: FIRST_USER_SETTING_KEY,
      value: true,
    })
    .onConflictDoNothing();

  return { result: undefined, events: [] };
};

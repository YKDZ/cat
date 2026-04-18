import { role } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const SeedSystemRolesCommandSchema = z.object({});

export type SeedSystemRolesCommand = z.infer<
  typeof SeedSystemRolesCommandSchema
>;

const SYSTEM_ROLES = [
  { name: "superadmin", description: "全局超级管理员", isSystem: true },
  { name: "admin", description: "系统管理员", isSystem: true },
  { name: "user", description: "普通用户", isSystem: true },
  { name: "viewer", description: "只读用户", isSystem: true },
] as const;

/**
 * 幂等地确保 4 个系统角色存在于数据库中。
 * 使用 INSERT ... ON CONFLICT DO NOTHING。
 */
export const seedSystemRoles: Command<SeedSystemRolesCommand> = async (
  ctx,
  _command,
) => {
  await ctx.db
    .insert(role)
    .values(SYSTEM_ROLES.map((r) => ({ ...r })))
    .onConflictDoNothing();

  return { result: undefined, events: [] };
};

import type { DbHandle } from "@cat/domain";
import type { Relation } from "@cat/shared/schema/permission";

import {
  executeCommand,
  executeQuery,
  grantFirstUserSuperadmin as grantFirstUserSuperadminCmd,
  loadUserSystemRoles as loadUserSystemRolesQuery,
  seedSystemRoles as seedSystemRolesCmd,
} from "@cat/domain";

/**
 * 系统启动时调用（幂等）：确保 4 个系统角色存在。
 * 使用 INSERT ... ON CONFLICT DO NOTHING。
 */
export const seedSystemRoles = async (db: DbHandle): Promise<void> => {
  await executeCommand({ db }, seedSystemRolesCmd, {});
};

/**
 * 在 createAccount 注册流程后调用。
 * 检查是否为首位用户：若是，自动授予 system#superadmin 权限元组，
 * 并将 setting "system:first_user_registered" 设置为 true。
 */
export const grantFirstUserSuperadmin = async (
  db: DbHandle,
  userId: string,
): Promise<void> => {
  await executeCommand({ db }, grantFirstUserSuperadminCmd, { userId });
};

/**
 * 加载用户的系统角色列表（通过权限元组查询）。
 * 返回用户对 system:* 持有的所有 relation 列表。
 */
export const loadUserSystemRoles = async (
  db: DbHandle,
  userId: string,
): Promise<Relation[]> => {
  return executeQuery({ db }, loadUserSystemRolesQuery, { userId });
};

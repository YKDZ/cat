import { randomBytes } from "node:crypto";
import {
  assertFirstOrNull,
  assertSingleNonNullish,
  assertSingleOrNull,
  logger,
} from "@cat/shared/utils";
import { hashPassword } from "./password.ts";
import {
  language as languageTable,
  pluginService,
  role,
} from "@/drizzle/schema/schema.ts";
import {
  user as userTable,
  account as accountTable,
} from "@/drizzle/schema/schema.ts";
import { getDrizzleDB } from "@/getter.ts";
import {
  permission as permissionTable,
  permissionTemplate as permissionTemplateTable,
  role as roleTable,
  rolePermission as rolePermissionTable,
  userRole as userRoleTable,
  setting as settingTable,
  type DrizzleTransaction,
} from "@/drizzle/index.ts";
import { ResourceTypeValues } from "@cat/shared/schema/drizzle/enum";
import { DEFAULT_SETTINGS } from "@/utils/settings/default.ts";
import { AvailableLocales } from "@/utils/languages/cldr.ts";
import { eq } from "drizzle-orm";

/**
 * 在应用启动前执行 \
 * 用于维护数据库中的基本条目 \
 * 不删除现有数据 \
 * 所有修改都是试探性的
 * @returns
 */
export const ensureDB = async (): Promise<void> => {
  const { client: drizzle } = await getDrizzleDB();

  await drizzle.transaction(async (tx) => {
    // 维护语言列表
    await tx
      .insert(languageTable)
      .values(
        AvailableLocales.availableLocales.full.map((locale) => ({
          id: locale,
        })),
      )
      .onConflictDoNothing();

    // 为所有权限类型注入一个根权限模板
    const templateIds: number[] = [];

    await Promise.all(
      ResourceTypeValues.map(async (type) => {
        const template = assertFirstOrNull(
          await tx
            .insert(permissionTemplateTable)
            .values({
              resourceType: type,
              content: "*",
            })
            .returning({
              id: permissionTemplateTable.id,
            })
            .onConflictDoNothing({
              target: [
                permissionTemplateTable.resourceType,
                permissionTemplateTable.content,
              ],
            }),
        );
        if (template) templateIds.push(template.id);
      }),
    );

    // 保证根角色永远存在
    // 且永远被分配所有资源类型的根权限
    const permissionIds: number[] = [];

    if (templateIds.length > 0)
      await Promise.all(
        templateIds.map(async (templateId) => {
          const permission = assertFirstOrNull(
            await tx
              .insert(permissionTable)
              .values({
                templateId,
              })
              .returning({
                id: permissionTable.id,
              })
              .onConflictDoNothing(),
          );
          if (permission) permissionIds.push(permission.id);
        }),
      );

    const role = assertSingleNonNullish(
      await tx
        .insert(roleTable)
        .values({
          name: "Server Admin",
          scopeId: "",
          scopeType: "GLOBAL",
        })
        .returning({
          id: roleTable.id,
        })
        .onConflictDoUpdate({
          target: [roleTable.name, roleTable.scopeType, roleTable.scopeId],
          set: {
            name: "Server Admin",
          },
        }),
    );

    if (permissionIds.length > 0)
      await tx
        .insert(rolePermissionTable)
        .values(
          permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        )
        .onConflictDoNothing();

    // 插入设置
    if (DEFAULT_SETTINGS.length > 0)
      await tx
        .insert(settingTable)
        .values(
          DEFAULT_SETTINGS.map((setting) => ({
            key: setting.key,
            value: setting.value,
          })),
        )
        .onConflictDoNothing();
  });
};

/**
 * 确保根管理员存在
 * 只有在第一次创建管理员时才为他分配根角色
 * 也即允许根角色和其默认的密码账户被从根管理员处移除
 */
export const ensureRootUser = async (tx: DrizzleTransaction): Promise<void> => {
  const admin = assertSingleOrNull(
    await tx
      .insert(userTable)
      .values({
        name: "admin",
        email: "admin@encmys.cn",
        emailVerified: true,
      })
      .returning({ id: userTable.id })
      .onConflictDoNothing({
        target: [userTable.name, userTable.email],
      }),
  );

  if (admin) {
    const password =
      process.env.NODE_ENV !== "production"
        ? "password"
        : randomBytes(8).toString("hex");

    const { id: authProviderId } = assertSingleNonNullish(
      await tx
        .select({
          id: pluginService.id,
        })
        .from(pluginService)
        .where(eq(pluginService.serviceId, "PASSWORD")),
    );

    await tx
      .insert(accountTable)
      .values({
        providerIssuer: "PASSWORD",
        providedAccountId: "admin@encmys.cn",
        authProviderId,
        userId: admin.id,
        meta: {
          password: await hashPassword(password),
        },
      })
      .onConflictDoNothing();

    const { id: roleId } = assertSingleNonNullish(
      await tx
        .select({
          id: role.id,
        })
        .from(role)
        .where(eq(role.name, "Server Admin")),
    );

    await tx
      .insert(userRoleTable)
      .values({
        roleId,
        userId: admin.id,
      })
      .onConflictDoNothing();

    logger.info("SERVER", {
      msg: `Default admin account password is: ${password}`,
    });
  }
};

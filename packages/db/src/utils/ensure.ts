import { assertSingleNonNullish, assertSingleOrNull } from "@cat/shared";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { DrizzleDB } from "@/drizzle/db.ts";
import {
  setting as settingTable,
  type DrizzleTransaction,
} from "@/drizzle/index.ts";
import {
  language as languageTable,
  pluginService,
} from "@/drizzle/schema/schema.ts";
import {
  user as userTable,
  account as accountTable,
} from "@/drizzle/schema/schema.ts";
import { AvailableLocales } from "@/utils/languages/cldr.ts";
import { DEFAULT_SETTINGS } from "@/utils/settings/default.ts";

import { hashPassword } from "./password.ts";

/**
 * 在应用启动前执行 \
 * 用于维护数据库中的基本条目 \
 * 不删除现有数据 \
 * 所有修改都是试探性的
 * @returns
 */
export const ensureDB = async (db: DrizzleDB): Promise<void> => {
  const drizzle = db.client;

  await drizzle.transaction(async (tx) => {
    // 维护语言列表
    await tx
      .insert(languageTable)
      .values(
        [
          ...AvailableLocales.availableLocales.full,
          "mul", // ISO 639-2 "multiple languages" — used for concept vectorization text
        ].map((locale) => ({
          id: locale,
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

    // oxlint-disable-next-line no-console db can not access server-shared package
    console.info(`Default admin account password is: ${password}`);
  }
};

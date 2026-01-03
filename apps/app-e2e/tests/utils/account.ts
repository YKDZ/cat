import { randomBytes } from "node:crypto";
import {
  account,
  eq,
  getDrizzleDB,
  hashPassword,
  pluginService,
  user as userTable,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";

export const acquireAccount = async (
  id: string,
): Promise<{
  email: string;
  password: string;
}> => {
  const email = `user${id}@encmys.cn`;
  const password = randomBytes(16).toString("hex");

  const { client: drizzle } = await getDrizzleDB();

  await drizzle.transaction(async (tx) => {
    const provider = assertSingleNonNullish(
      await tx
        .select({
          id: pluginService.id,
        })
        .from(pluginService)
        // TODO 此时默认只有 GLOBAL 这个 Scope 包含这个插件
        .where(eq(pluginService.serviceId, "PASSWORD")),
    );

    await tx
      .insert(userTable)
      .values({
        email,
        emailVerified: true,
        name: email,
      })
      .returning({
        id: userTable.id,
      })
      .onConflictDoNothing();

    const user = assertSingleNonNullish(
      await tx
        .select({
          id: userTable.id,
        })
        .from(userTable)
        .where(eq(userTable.email, email)),
    );

    await tx
      .insert(account)
      .values({
        meta: {
          password: await hashPassword(password),
        },
        providedAccountId: email,
        providerIssuer: "PASSWORD",
        authProviderId: provider.id,
        userId: user.id,
      })
      .onConflictDoUpdate({
        target: [account.providerIssuer, account.providedAccountId],
        set: {
          meta: {
            password: await hashPassword(password),
          },
        },
      });
  });

  return {
    email,
    password,
  };
};

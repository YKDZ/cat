import { randomBytes } from "node:crypto";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { hashPassword } from "./password.ts";
import { language as languageTable } from "@/drizzle/schema/misc.ts";
import {
  user as userTable,
  account as accountTable,
} from "@/drizzle/schema/user.ts";
import { getDrizzleDB } from "@/getter.ts";

export const init = async (): Promise<void> => {
  const { client: drizzle } = await getDrizzleDB();

  const user = await drizzle.query.language.findMany({
    columns: { id: true },
  });

  if (user.length > 0) return;

  await drizzle.transaction(async (tx) => {
    await tx.insert(languageTable).values([
      {
        id: "en",
      },
      {
        id: "zh_Hans",
      },
    ]);

    const password =
      process.env.NODE_ENV !== "production"
        ? "password"
        : randomBytes(8).toString("hex");

    const user = assertSingleNonNullish(
      await tx
        .insert(userTable)
        .values({
          name: "admin",
          email: "admin@encmys.cn",
          emailVerified: true,
        })
        .returning({ id: userTable.id }),
    );

    await tx.insert(accountTable).values({
      type: "ID_PASSWORD",
      provider: "EMAIL_PASSWORD",
      providedAccountId: "admin@encmys.cn",
      userId: user.id,
      meta: {
        password: await hashPassword(password),
      },
    });

    // oxlint-disable-next-line no-console
    console.log(`Default admin password is: ${password}`);
  });
};

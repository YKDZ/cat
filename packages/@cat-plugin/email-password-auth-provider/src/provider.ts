import {
  eq,
  getDrizzleDB,
  verifyPassword,
  user as userTable,
  getColumns,
  and,
  account as accountTable,
} from "@cat/db";
import type { AuthProvider, AuthResult } from "@cat/plugin-core";
import { JSONSchema } from "@cat/shared/schema/json";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

const FormSchema = z.object({
  email: z.email().meta({ "x-autocomplete": "email" }),
  password: z
    .string()
    .min(6)
    .meta({ "x-secret": true, "x-autocomplete": "current-password" }),
});

export class Provider implements AuthProvider {
  getId(): string {
    return "EMAIL_PASSWORD";
  }

  getType(): string {
    return "ID_PASSWORD";
  }

  getName(): string {
    return "邮箱 + 密码";
  }

  getIcon(): string {
    return "icon-[mdi--ssh]";
  }

  getAuthFormSchema(): JSONSchema {
    return z.toJSONSchema(FormSchema);
  }

  async handleAuth(gotFromClient: { formData?: unknown }): Promise<AuthResult> {
    const { client: drizzle } = await getDrizzleDB();
    const { email, password } = FormSchema.parse(gotFromClient.formData);

    const account = await drizzle.transaction(async (tx) => {
      const user = assertSingleOrNull(
        await tx
          .select({
            id: userTable.id,
          })
          .from(userTable)
          .where(eq(userTable.email, email)),
      );

      if (!user) return null;

      return assertSingleOrNull(
        await drizzle
          .select(getColumns(accountTable))
          .from(accountTable)
          .where(
            and(
              eq(accountTable.userId, user.id),
              eq(accountTable.provider, this.getId()),
            ),
          ),
      );
    });

    if (!account) throw new Error("User not exists");

    // 仅在密码账户存在时验证密码
    // 不允许注册
    if (
      !(await verifyPassword(
        password,
        z
          .object({
            password: z.string(),
          })
          .parse(account.meta).password,
      ))
    )
      throw Error("Wrong password");

    return {
      email,
      userName: email,
      providerIssuer: this.getId(),
      providedAccountId: email,
    } satisfies AuthResult;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

import {
  eq,
  getDrizzleDB,
  verifyPassword,
  user as userTable,
  getColumns,
  and,
  account as accountTable,
} from "@cat/db";
import { AuthProvider, type AuthResult } from "@cat/plugin-core";
import { JSONSchema } from "@cat/shared/schema/json";
import { assertFirstNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

const FormSchema = z.object({
  password: z
    .string()
    .min(6)
    .meta({ "x-secret": true, "x-autocomplete": "current-password" }),
});

export class Provider extends AuthProvider {
  getId(): string {
    return "PASSWORD";
  }

  getName(): string {
    return "密码";
  }

  getIcon(): string {
    return "icon-[mdi--ssh]";
  }

  override getAuthFormSchema(): JSONSchema {
    return z.toJSONSchema(FormSchema);
  }

  async handleAuth(
    userId: string,
    identifier: string,
    gotFromClient: { formData?: unknown },
  ): Promise<AuthResult> {
    const { client: drizzle } = await getDrizzleDB();
    const { password } = FormSchema.parse(gotFromClient.formData);

    const account = await drizzle.transaction(async (tx) => {
      const user = assertFirstNonNullish(
        await tx
          .select({
            id: userTable.id,
          })
          .from(userTable)
          .where(eq(userTable.id, userId)),
      );

      return assertFirstNonNullish(
        await tx
          .select(getColumns(accountTable))
          .from(accountTable)
          .where(
            and(
              eq(accountTable.userId, user.id),
              eq(accountTable.providedAccountId, identifier),
            ),
          ),
      );
    });

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
      providerIssuer: this.getId(),
      providedAccountId: identifier,
    } satisfies AuthResult;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

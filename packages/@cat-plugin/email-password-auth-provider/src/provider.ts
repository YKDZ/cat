import { getPrismaDB, verifyPassword } from "@cat/db";
import type { AuthProvider, AuthResult } from "@cat/plugin-core";
import * as z from "zod/v4";

const FormSchema = z.object({
  email: z.email().meta({ "x-autocomplete": "email" }),
  password: z
    .string()
    .min(6)
    .meta({ "x-secret": true, "x-autocomplete": "current-password" }),
});

export class Provider implements AuthProvider {
  getId() {
    return "EMAIL_PASSWORD";
  }

  getType() {
    return "ID_PASSWORD";
  }

  getName() {
    return "邮箱 + 密码";
  }

  getIcon() {
    return "i-mdi:ssh";
  }

  getAuthFormSchema() {
    return z.toJSONSchema(FormSchema);
  }

  async handleAuth(gotFromClient: { formData?: unknown }) {
    const { client: prisma } = await getPrismaDB();
    const { email, password } = FormSchema.parse(gotFromClient.formData);

    const account = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
        },
      });

      if (!user) return null;

      const account = await prisma.account.findUnique({
        where: {
          userId_provider: {
            userId: user.id,
            provider: this.getId(),
          },
        },
      });

      return account;
    });

    if (!account) throw new Error("User not exists");

    // 仅在密码账户存在时验证密码
    // 不允许注册
    if (
      !(await verifyPassword(
        password,
        (account.meta as { password: string }).password,
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

  async isAvailable() {
    return true;
  }
}

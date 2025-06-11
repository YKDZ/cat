import { hashPassword, prisma, verifyPassword } from "@cat/db";
import type { AuthProvider, AuthResult } from "@cat/plugin-core";
import type { HTTPHelpers } from "@cat/shared";

export class Provider implements AuthProvider {
  getId() {
    return "USERNAME_PASSWORD";
  }

  getType() {
    return "ID_PASSWORD";
  }

  getName() {
    return "用户名 + 密码";
  }

  getAuthFormSchema() {
    return JSON.stringify({
      type: "object",
      properties: {
        username: {
          type: "string",
        },
        password: {
          type: "string",
        },
      },
    });
  }

  async handleAuth(gotFromClient: unknown, helpers: HTTPHelpers) {
    if (
      !gotFromClient ||
      typeof gotFromClient !== "object" ||
      !("username" in gotFromClient) ||
      !("password" in gotFromClient) ||
      typeof gotFromClient.username !== "string" ||
      typeof gotFromClient.password !== "string"
    ) {
      throw new Error();
    }

    const { username, password } = gotFromClient;

    const account = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: {
          name: username,
        },
        select: {
          id: true,
        },
      });

      if (!user) return null;

      const account = await prisma.account.findUnique({
        where: {
          userId_provider: {
            userId: user?.id,
            provider: this.getId(),
          },
        },
      });

      return account;
    });

    // 仅在密码账户存在时验证密码
    // 否则就是创建密码账户
    if (account) {
      if (
        !(await verifyPassword(
          password,
          (account.meta as { password: string }).password,
        ))
      )
        throw Error("Wrong password");
    }

    return {
      userName: username,
      providerIssuer: this.getId(),
      providedAccountId: this.getId(),
      accountMeta: {
        password: await hashPassword(password),
      },
    } satisfies AuthResult;
  }
}

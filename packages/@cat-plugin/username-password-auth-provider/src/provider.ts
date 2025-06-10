import type { AuthProvider, AuthResult } from "@cat/plugin-core";
import type { HTTPHelpers } from "@cat/shared";
import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@cat/db";

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

    const { user, account } = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: {
          name: username,
        },
        include: {
          Accounts: {
            where: {
              provider: "USERNAME_PASSWORD",
            },
          },
        },
      });

      if (!user || (user && user.Accounts.length === 0)) {
        user = await tx.user.upsert({
          where: {
            name: username,
          },
          create: {
            name: username,
            Accounts: {
              create: {
                provider: this.getId(),
                providedAccountId: await hashPassword(password),
                type: this.getId(),
              },
            },
          },
          update: {
            Accounts: {
              create: {
                provider: this.getId(),
                providedAccountId: await hashPassword(password),
                type: this.getId(),
              },
            },
          },
          include: {
            Accounts: {
              where: {
                provider: "USERNAME_PASSWORD",
              },
            },
          },
        });
      }

      const account = user.Accounts[0]!;

      if (await verifyPassword(password, account?.providedAccountId))
        throw Error("Wrong password");

      return {
        user,
        account,
      };
    });

    return {
      userName: user.name,
      providerIssuer: account.provider,
      providedAccountId: user.name,
    } satisfies AuthResult;
  }
}

const hashPassword = (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    pbkdf2(password, salt, 1024, 64, "sha512", (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
};

/**
 * 验证密码
 * @param {string} password 明文密码
 * @param {string} storedSaltHash 存储的 salt:hash 字符串
 * @returns {Promise<boolean>}
 */
const verifyPassword = (password: string, storedSaltHash: string) => {
  return new Promise((resolve, reject) => {
    const [salt, key] = storedSaltHash.split(":");
    pbkdf2(password, salt, 1024, 64, "sha512", (err, derivedKey) => {
      if (err) return reject(err);
      resolve(timingSafeEqual(Buffer.from(key, "hex"), derivedKey));
    });
  });
};

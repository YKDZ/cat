import { executeCommand, registerUserWithPasswordAccount } from "@cat/domain";
import { grantFirstUserSuperadmin } from "@cat/permissions";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { base } from "@/orpc/server";

import { finishLogin } from "./schemas.ts";

export const register = base
  .input(
    z.object({
      email: z.email(),
      name: z.string(),
      password: z.string(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      sessionStore,
      drizzleDB: { client: drizzle },
      pluginManager,
      helpers,
    } = context;
    const { email, name, password } = input;

    // TODO 就算是内部插件 ID 也有可能变
    const authProvider = pluginManager.getService(
      "password-auth-provider",
      "AUTH_PROVIDER",
      "PASSWORD",
    );

    if (!authProvider) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Auth Provider PASSWORD does not exists",
      });
    }

    const result = await drizzle.transaction(async (tx) => {
      return executeCommand({ db: tx }, registerUserWithPasswordAccount, {
        email,
        name,
        password,
        authProviderId: authProvider.dbId,
      });
    });

    // 检查是否为首位用户，若是则自动授予 superadmin
    await grantFirstUserSuperadmin(drizzle, result.userId);

    await finishLogin(
      sessionStore,
      drizzle,
      result.userId,
      {
        providerIssuer: result.providerIssuer,
        providedAccountId: result.providedAccountId,
        authProviderId: authProvider.dbId,
      },
      helpers,
    );
  });

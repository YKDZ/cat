import { executeCommand, registerUserWithPasswordAccount } from "@cat/domain";
import { grantFirstUserSuperadmin } from "@cat/permissions";
import {
  resolveServiceImplementation,
  ServiceImplementationResolutionError,
} from "@cat/server-shared";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { base } from "#/orpc/server.ts";

import { finishLogin } from "./schemas.ts";

const passwordAuthProviderReference =
  ServiceImplementationReferenceSchema.parse({
    pluginId: "password-auth-provider",
    serviceId: "PASSWORD",
    serviceType: "AUTH_FACTOR",
    scopeType: "GLOBAL",
    scopeId: "",
  });

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

    try {
      resolveServiceImplementation(
        pluginManager,
        passwordAuthProviderReference,
        "AUTH_FACTOR",
      );
    } catch (error) {
      if (error instanceof ServiceImplementationResolutionError) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Password authentication provider is unavailable.",
        });
      }
      throw error;
    }

    const result = await drizzle.transaction(async (tx) => {
      return executeCommand({ db: tx }, registerUserWithPasswordAccount, {
        email,
        name,
        password,
        authProvider: passwordAuthProviderReference,
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
        authProvider: passwordAuthProviderReference,
      },
      helpers,
    );
  });

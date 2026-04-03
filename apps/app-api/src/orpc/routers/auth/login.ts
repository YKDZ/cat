import type { AuthProvider } from "@cat/plugin-core";

import {
  countRecentAttempts,
  createAccount,
  createUser,
  executeCommand,
  executeQuery,
  findAccountByProviderIdentity,
  findUserByIdentifier,
  insertLoginAttempt,
} from "@cat/domain";
import { grantFirstUserSuperadmin } from "@cat/permissions";
import { getServiceFromDBId } from "@cat/server-shared";
import { JSONSchemaSchema, safeZDotJson } from "@cat/shared/schema/json";
import { ORPCError } from "@orpc/client";
import { randomBytes } from "node:crypto";
import * as z from "zod/v4";

import { base } from "@/orpc/server";

import {
  finishLogin,
  PreAuthSessionPayloadSchema,
  sessionKeys,
} from "./schemas.ts";

export const getAuthFormSchema = base
  .input(
    z.object({
      providerId: z.int(),
    }),
  )
  .output(JSONSchemaSchema)
  .handler(async ({ context, input }) => {
    const { pluginManager } = context;
    const { providerId } = input;

    const provider = getServiceFromDBId<AuthProvider>(
      pluginManager,
      providerId,
    );

    if (!provider)
      throw new ORPCError("BAD_REQUEST", {
        message: `Auth Provider ${providerId} does not exists`,
      });

    if (typeof provider.getAuthFormSchema !== "function") return {};

    return provider.getAuthFormSchema();
  });

export const preAuth = base
  .input(
    z.object({
      identifier: z.string(),
      authProviderId: z.int(),
    }),
  )
  .output(
    z.object({
      gotFromServer: safeZDotJson.optional(),
      /**
       * 未定义代表用户不存在，走注册流程
       */
      userId: z.uuidv4().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      sessionStore,
      drizzleDB: { client: drizzle },
      pluginManager,
      helpers,
    } = context;
    const { identifier, authProviderId } = input;

    if (context.user)
      throw new ORPCError("CONFLICT", { message: "Already login" });

    // 登录频率限制：15 分钟内同 IP 或标识符的失败次数不超过 10 次
    const ip =
      helpers.getReqHeader("x-forwarded-for") ??
      helpers.getReqHeader("x-real-ip") ??
      undefined;
    const recentFailures = await executeQuery(
      { db: drizzle },
      countRecentAttempts,
      { identifier, ip, windowMinutes: 15 },
    );
    if (recentFailures >= 10) {
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "Too many failed login attempts. Please try again later.",
      });
    }

    const user = await executeQuery({ db: drizzle }, findUserByIdentifier, {
      identifier,
    });

    const userId = user?.id;

    const provider = getServiceFromDBId<AuthProvider>(
      pluginManager,
      authProviderId,
    );

    if (!provider)
      throw new ORPCError("BAD_REQUEST", {
        message: `Auth Provider ${authProviderId} does not exists`,
      });

    const sessionId = randomBytes(32).toString("hex");

    if (typeof provider.handlePreAuth === "function") {
      const { passToClient, meta } = await provider.handlePreAuth({
        identifier,
      });

      const sessionKey = sessionKeys.preAuth(sessionId);
      await sessionStore.create(
        sessionKey,
        {
          ...(userId ? { userId } : {}),
          identifier,
          authProviderId: String(authProviderId),
          meta: JSON.stringify(meta),
        },
        5 * 60,
      );

      helpers.setCookie("preAuthSessionId", sessionId);

      return {
        gotFromServer: passToClient,
        ...(userId ? { userId } : {}),
      };
    } else {
      if (!userId) return {};

      const sessionKey = sessionKeys.preAuth(sessionId);
      await sessionStore.create(
        sessionKey,
        {
          userId,
          identifier,
          authProviderId: String(authProviderId),
          meta: JSON.stringify({}),
        },
        5 * 60,
      );

      helpers.setCookie("preAuthSessionId", sessionId);

      return {
        userId,
      };
    }
  });

export const auth = base
  .input(
    z.object({
      passToServer: z.object({
        urlSearchParams: z.json(),
        formData: z.json().optional(),
      }),
    }),
  )
  .output(
    z.object({
      status: z.enum(["SUCCESS", "MFA_REQUIRED"]),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      sessionStore,
      drizzleDB: { client: drizzle },
      helpers,
      pluginManager,
    } = context;
    const { passToServer } = input;

    if (context.user)
      throw new ORPCError("CONFLICT", { message: "Already logged in" });

    const preAuthSessionId = helpers.getCookie("preAuthSessionId");

    if (!preAuthSessionId)
      throw new ORPCError("UNAUTHORIZED", {
        message: "Pre-auth session ID not found",
      });

    const preAuthSessionKey = sessionKeys.preAuth(preAuthSessionId);
    helpers.delCookie("preAuthSessionId");

    const { userId, identifier, authProviderId, meta } =
      PreAuthSessionPayloadSchema.parse(
        await sessionStore.getAll(preAuthSessionKey),
      );
    await sessionStore.destroy(preAuthSessionKey);

    const provider = getServiceFromDBId<AuthProvider>(
      pluginManager,
      authProviderId,
    );

    if (!provider)
      throw new ORPCError("BAD_REQUEST", {
        message: `Auth Provider ${authProviderId} does not exists`,
      });

    const ip =
      helpers.getReqHeader("x-forwarded-for") ??
      helpers.getReqHeader("x-real-ip") ??
      null;
    const userAgent = helpers.getReqHeader("user-agent") ?? null;

    let authResult: Awaited<ReturnType<typeof provider.handleAuth>>;
    try {
      authResult = await provider.handleAuth(
        userId ?? "",
        identifier,
        passToServer,
        z.json().parse(JSON.parse(meta)),
      );
    } catch (err) {
      // 记录失败的登录尝试（异步，不阻塞响应）
      executeCommand({ db: drizzle }, insertLoginAttempt, {
        identifier,
        ip,
        userAgent,
        success: false,
        failReason: err instanceof Error ? err.message : "Unknown error",
      }).catch(() => {
        // ignore: fire-and-forget, login attempt logging failure should not block auth
      });
      throw err;
    }

    const { providerIssuer, providedAccountId, accountMeta } = authResult;

    let account: {
      userId?: string;
      providerIssuer: string;
      providedAccountId: string;
    } | null = await executeQuery(
      { db: drizzle },
      findAccountByProviderIdentity,
      {
        providerIssuer,
        providedAccountId,
        authProviderId,
      },
    );

    // 解析出本次登录最终确定的 userId
    let resolvedUserId = userId ?? account?.userId;

    // 代表这是此用户的新身份
    if (!account) {
      if (
        typeof provider.supportsAutoRegister === "function" &&
        provider.supportsAutoRegister() &&
        typeof provider.handleAutoRegister === "function"
      ) {
        // 支持自动注册：创建用户 + Account
        const regInfo = await provider.handleAutoRegister(
          authResult,
          authResult.rawPayload ?? {},
        );

        const newUser = await executeCommand({ db: drizzle }, createUser, {
          email: regInfo.email,
          name: regInfo.name,
        });

        resolvedUserId = newUser.id;

        // 首位用户自动授予 superadmin
        await grantFirstUserSuperadmin(drizzle, newUser.id);

        account = await executeCommand({ db: drizzle }, createAccount, {
          userId: newUser.id,
          authProviderId,
          providerIssuer,
          providedAccountId,
          accountMeta: regInfo.accountMeta,
        });
      } else if (resolvedUserId) {
        // 为已有用户绑定新身份
        account = await executeCommand({ db: drizzle }, createAccount, {
          userId: resolvedUserId,
          authProviderId,
          providerIssuer,
          providedAccountId,
          accountMeta,
        });
      } else {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User not found and auto-register not supported",
        });
      }
    }

    if (!resolvedUserId) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Could not determine user ID after authentication",
      });
    }

    // 记录成功的登录尝试（异步）
    executeCommand({ db: drizzle }, insertLoginAttempt, {
      identifier,
      ip,
      userAgent,
      success: true,
      failReason: null,
    }).catch(() => {
      // ignore: fire-and-forget, login attempt logging failure should not block auth
    });

    const mfaFactorIds: number[] = [];

    for (const { dbId, service } of pluginManager.getServices("AUTH_FACTOR")) {
      if (service.getAal() === 2) {
        mfaFactorIds.push(dbId);
      }
    }

    if (mfaFactorIds.length > 0) {
      const waitingMFASessionId = randomBytes(32).toString("hex");
      const waitingMFASessionKey = sessionKeys.waitingMFA(waitingMFASessionId);

      await sessionStore.create(
        waitingMFASessionKey,
        {
          userId: resolvedUserId,
          authProviderId: String(authProviderId),
          mfaProviderIds: JSON.stringify(mfaFactorIds),
        },
        5 * 60,
      );

      helpers.setCookie("waitingMFASessionId", waitingMFASessionId);

      return {
        status: "MFA_REQUIRED",
      };
    } else {
      await finishLogin(
        sessionStore,
        drizzle,
        resolvedUserId,
        {
          ...account,
          authProviderId,
        },
        helpers,
      );
      return {
        status: "SUCCESS",
      };
    }
  });

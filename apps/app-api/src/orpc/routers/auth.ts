import { randomBytes } from "node:crypto";
import * as z from "zod/v4";
import { JSONSchemaSchema, safeZDotJson } from "@cat/shared/schema/json";
import type { AuthProvider, MFAProvider } from "@cat/plugin-core";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import {
  account as accountTable,
  and,
  eq,
  getColumns,
  hashPassword,
  mfaProvider,
  or,
  user as userTable,
  type RedisClientType,
} from "@cat/db";
import {
  assertSingleNonNullish,
  assertSingleOrNull,
  type HTTPHelpers,
} from "@cat/shared/utils";

const finishLogin = async (
  redis: RedisClientType,
  userId: string,
  meta: RedisPayload & {
    authProviderId: number;
  },
  helpers: HTTPHelpers,
) => {
  const sessionId = randomBytes(32).toString("hex");
  const sessionKey = `user:session:${sessionId}`;

  await redis.hSet(sessionKey, {
    userId,
    ...meta,
  });
  await redis.expire(sessionKey, 24 * 60 * 60);

  helpers.setCookie("sessionId", sessionId);
};

import { HashTypeSchema, type RedisPayload } from "@cat/shared/schema/redis";
import { authed, base } from "@/orpc/server";
import { ORPCError } from "@orpc/client";

const getPreAuthSessionKey = (sessionId: string) =>
  `auth:preAuth:session:${sessionId}`;
const PreAuthSessionPayloadSchema = z
  .object({
    userId: z.string(),
    authProviderId: z.coerce.number().int(),
    identifier: z.string(),
    meta: z.string(),
  })
  .catchall(HashTypeSchema);
type PreAuthSessionPayload = z.infer<typeof PreAuthSessionPayloadSchema>;

const getPreMFASessionKey = (sessionId: string) =>
  `auth:preMFA:session:${sessionId}`;
const PreMFAPayloadSchema = z
  .object({
    userId: z.uuidv4(),
    mfaProviderId: z.coerce.number().int(),
    meta: z.string(),
  })
  .catchall(HashTypeSchema);
type PreMFAPayload = z.infer<typeof PreMFAPayloadSchema>;

const getSuccessMFASessionKey = (sessionId: string) =>
  `mfa:success:${sessionId}`;
const SuccessMFAPayloadSchema = z
  .object({
    succeedAt: z.coerce.number().int(),
    mfaProviderId: z.coerce.number().int(),
    userId: z.uuidv4(),
  })
  .catchall(HashTypeSchema);
type SuccessMFAPayload = z.infer<typeof SuccessMFAPayloadSchema>;

const getWaitingMFASessionKey = (sessionId: string) =>
  `auth:waitingMFA:${sessionId}`;
const WatingMFAPayloadSchema = z
  .object({
    userId: z.uuidv4(),
    authProviderId: z.coerce.number().int(),
    mfaProviderIds: z.string(),
  })
  .catchall(HashTypeSchema);
type WaitingMFAPayload = z.infer<typeof WatingMFAPayloadSchema>;

const getPreInitMFASessionKey = (sessionId: string) =>
  `auth:preInitMFA:${sessionId}`;
const PreInitMFAPayloadSchema = z.object({
  userId: z.uuidv4(),
  mfaProviderId: z.coerce.number().int(),
  payload: z.string(),
});
type PreInitMFAPayload = z.infer<typeof PreInitMFAPayloadSchema>;

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
      redisDB: { redis },
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

    const { account, user } = await drizzle.transaction(async (tx) => {
      const user = assertSingleNonNullish(
        await tx
          .insert(userTable)
          .values({
            email,
            name,
            emailVerified: false,
          })
          .returning({ id: userTable.id }),
      );

      const account = assertSingleNonNullish(
        await tx
          .insert(accountTable)
          .values({
            userId: user.id,
            providerIssuer: "PASSWORD",
            providedAccountId: email,
            meta: {
              password: await hashPassword(password),
            },
            authProviderId: authProvider.dbId,
          })
          .returning({
            providerIssuer: accountTable.providerIssuer,
            providedAccountId: accountTable.providedAccountId,
          }),
      );

      return { account, user };
    });

    await finishLogin(
      redis,
      user.id,
      {
        ...account,
        authProviderId: authProvider.dbId,
      },
      helpers,
    );
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
      redisDB: { redis },
      drizzleDB: { client: drizzle },
      pluginManager,
      helpers: { setCookie },
    } = context;
    const { identifier, authProviderId } = input;

    if (context.user)
      throw new ORPCError("CONFLICT", { message: "Already login" });

    const user = assertSingleOrNull(
      await drizzle
        .select({
          id: userTable.id,
        })
        .from(userTable)
        .where(
          or(eq(userTable.email, identifier), eq(userTable.name, identifier)),
        ),
    );

    if (!user) return {};

    const userId = user.id;

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

      const sessionKey = getPreAuthSessionKey(sessionId);
      await redis.hSet(sessionKey, {
        userId,
        identifier,
        authProviderId,
        meta: JSON.stringify(meta),
      } satisfies PreAuthSessionPayload);
      await redis.expire(sessionKey, 5 * 60);

      setCookie("preAuthSessionId", sessionId);

      return {
        gotFromServer: passToClient,
        userId,
      };
    } else {
      const sessionKey = getPreAuthSessionKey(sessionId);
      await redis.hSet(sessionKey, {
        userId,
        identifier,
        authProviderId,
        meta: JSON.stringify({}),
      } satisfies PreAuthSessionPayload);
      await redis.expire(sessionKey, 5 * 60);

      setCookie("preAuthSessionId", sessionId);

      return {
        userId,
      };
    }
  });

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
      redisDB: { redis },
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

    const preAuthSessionKey = getPreAuthSessionKey(preAuthSessionId);
    helpers.delCookie("preAuthSessionId");

    const { userId, identifier, authProviderId, meta } =
      PreAuthSessionPayloadSchema.parse(await redis.hGetAll(preAuthSessionKey));
    await redis.del(preAuthSessionKey);

    const provider = getServiceFromDBId<AuthProvider>(
      pluginManager,
      authProviderId,
    );

    if (!provider)
      throw new ORPCError("BAD_REQUEST", {
        message: `Auth Provider ${authProviderId} does not exists`,
      });

    const { providerIssuer, providedAccountId, accountMeta } =
      await provider.handleAuth(
        userId,
        identifier,
        passToServer,
        z.json().parse(JSON.parse(meta)),
      );

    let account = assertSingleOrNull(
      await drizzle
        .select({
          providerIssuer: accountTable.providerIssuer,
          providedAccountId: accountTable.providedAccountId,
        })
        .from(accountTable)
        .where(
          and(
            eq(accountTable.providerIssuer, providerIssuer),
            eq(accountTable.providedAccountId, providedAccountId),
            eq(accountTable.authProviderId, authProviderId),
          ),
        ),
    );

    // 代表这是此用户的新身份
    // 为其创建 Account 并绑定到用户
    if (!account) {
      account = assertSingleNonNullish(
        await drizzle
          .insert(accountTable)
          .values({
            providedAccountId,
            providerIssuer,
            userId,
            authProviderId,
            meta: accountMeta,
          })
          .returning({
            providerIssuer: accountTable.providerIssuer,
            providedAccountId: accountTable.providedAccountId,
          }),
      );
    }

    const mfaProviderIds: number[] = [];

    await Promise.all(
      pluginManager.getServices("MFA_PROVIDER").map(async (p) => {
        mfaProviderIds.push(p.dbId);
      }),
    );

    if (mfaProviderIds.length > 0) {
      const waitingMFASessionId = randomBytes(32).toString("hex");
      const waitingMFASessionKey = getWaitingMFASessionKey(waitingMFASessionId);

      await redis.hSet(waitingMFASessionKey, {
        userId,
        authProviderId,
        mfaProviderIds: JSON.stringify(mfaProviderIds),
      } satisfies WaitingMFAPayload);
      await redis.expire(waitingMFASessionKey, 5 * 60);

      return {
        status: "MFA_REQUIRED",
      };
    } else {
      await finishLogin(
        redis,
        userId,
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

export const preMfa = base
  .input(
    z.object({
      userId: z.uuidv4(),
      mfaProviderId: z.int(),
    }),
  )
  .output(
    z
      .object({
        gotFromServer: safeZDotJson,
      })
      .optional(),
  )
  .handler(async ({ context, input }) => {
    const {
      redisDB: { redis },
      pluginManager,
      helpers,
    } = context;
    const { userId, mfaProviderId } = input;

    const provider = getServiceFromDBId<MFAProvider>(
      pluginManager,
      mfaProviderId,
    );

    if (typeof provider.generateChallenge !== "function") return;

    const sessionId = randomBytes(32).toString("hex");
    const sessionKey = getPreMFASessionKey(sessionId);

    const { passToClient, meta } = await provider.generateChallenge();

    await redis.hSet(
      sessionKey,
      PreMFAPayloadSchema.parse({
        userId,
        mfaProviderId,
        meta: JSON.stringify(meta),
      } satisfies PreMFAPayload),
    );
    await redis.expire(sessionKey, 5 * 60);

    helpers.setCookie("preMFASessionId", sessionId);

    return {
      gotFromServer: passToClient,
    };
  });

export const getMfaFormSchema = base
  .input(
    z.object({
      mfaProviderId: z.int(),
    }),
  )
  .output(JSONSchemaSchema)
  .handler(async ({ context, input }) => {
    const { pluginManager } = context;
    const { mfaProviderId } = input;

    const provider = getServiceFromDBId<MFAProvider>(
      pluginManager,
      mfaProviderId,
    );

    if (typeof provider.getVerifyChallengeFormSchema !== "function") return {};

    return provider.getVerifyChallengeFormSchema();
  });

export const preInitMfaForUser = authed
  .input(
    z.object({
      mfaProviderId: z.int(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      redisDB: { redis },
      pluginManager,
      user,
      helpers,
    } = context;
    const { mfaProviderId } = input;

    const provider = getServiceFromDBId<MFAProvider>(
      pluginManager,
      mfaProviderId,
    );

    if (typeof provider.preInitForUser !== "function") return;

    const result = await provider.preInitForUser({
      userId: user.id,
    });

    const sessionId = randomBytes(32).toString("hex");
    const sessionKey = getPreInitMFASessionKey(sessionId);

    await redis.hSet(sessionKey, {
      userId: user.id,
      mfaProviderId,
      payload: JSON.stringify(result.payload),
    } satisfies PreInitMFAPayload);
    await redis.expire(sessionKey, 5 * 60);

    helpers.setCookie("preInitMFASessionId", sessionId);
  });

export const initMfaForUser = authed
  .input(
    z.object({
      passToServer: safeZDotJson,
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      redisDB: { redis },
      drizzleDB: { client: drizzle },
      pluginManager,
      user,
      helpers,
    } = context;
    const { passToServer } = input;

    const sessionId = helpers.getCookie("preInitMFASessionId");
    helpers.delCookie("preInitMFASessionId");

    if (!sessionId)
      throw new ORPCError("UNAUTHORIZED", {
        message: "No preInitMFASessionId provided",
      });

    const sessionKey = getPreInitMFASessionKey(sessionId);
    const { payload, mfaProviderId, userId } = PreInitMFAPayloadSchema.parse(
      await redis.hGetAll(sessionKey),
    );
    await redis.del(sessionKey);

    if (userId !== user.id)
      throw new ORPCError("UNAUTHORIZED", {
        message: "User ID mismatch",
      });

    const provider = getServiceFromDBId<MFAProvider>(
      pluginManager,
      mfaProviderId,
    );

    if (typeof provider.initForUser !== "function") return;

    const result = await provider.initForUser({
      userId: user.id,
      gotFromClient: passToServer,
      preInitPayload: z.json().parse(JSON.parse(payload)) ?? {},
    });

    if (!result.isSuccess)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to initialize MFA for user",
      });

    await drizzle.insert(mfaProvider).values({
      mfaServiceId: mfaProviderId,
      userId: user.id,
      payload: result.payload ?? {},
    });
  });

export const mfa = base
  .input(
    z.object({
      passToServer: z.object({
        formData: safeZDotJson.optional(),
      }),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redis },
      pluginManager,
      helpers,
    } = context;
    const { passToServer } = input;

    const sessionId = helpers.getCookie("preMFASessionId");

    if (!sessionId)
      throw new ORPCError("UNAUTHORIZED", {
        message: `No sessionId provided`,
      });

    const sessionKey = getPreMFASessionKey(sessionId);
    const { userId, mfaProviderId, meta } = PreMFAPayloadSchema.parse(
      await redis.hGetAll(sessionKey),
    );
    await redis.del(sessionKey);
    helpers.delCookie("preMFASessionId");

    const provider = getServiceFromDBId<MFAProvider>(
      pluginManager,
      mfaProviderId,
    );

    if (!provider)
      throw new ORPCError("BAD_REQUEST", {
        message: `MFA Provider ${mfaProviderId} does not exists`,
      });

    const dbProvider = assertSingleNonNullish(
      await drizzle
        .select(getColumns(mfaProvider))
        .from(mfaProvider)
        .where(eq(mfaProvider.id, mfaProviderId)),
    );

    const { isSuccess } = await provider.verifyChallenge({
      gotFromClient: passToServer,
      generateChallengeMeta: z.json().parse(JSON.parse(meta)),
      mfaProvider: dbProvider,
    });

    if (!isSuccess)
      throw new ORPCError("UNAUTHORIZED", {
        message: "MFA verification failed",
      });

    // 创建一个 MFA 成功的临时记录以便各种 completeXXXWithMFA 取用
    const successMFASessionId = randomBytes(32).toString("hex");
    const successMFASessionKey = getSuccessMFASessionKey(successMFASessionId);
    await redis.hSet(successMFASessionKey, {
      succeedAt: Date.now(),
      mfaProviderId,
      userId,
    } satisfies SuccessMFAPayload);
    await redis.expire(successMFASessionKey, 5 * 60);

    helpers.setCookie("successMFASessionId", successMFASessionId);
  });

export const completeAuthWithMFA = base
  .output(z.void())
  .handler(async ({ context }) => {
    const {
      redisDB: { redis },
      helpers,
    } = context;

    const waitingMFASessionId = helpers.getCookie("waitingMFASessionId");
    helpers.delCookie("waitingMFASessionId");

    if (!waitingMFASessionId)
      throw new ORPCError("UNAUTHORIZED", {
        message: "No waitingMFASessionId provided",
      });

    const waitingMFASessionKey = getWaitingMFASessionKey(waitingMFASessionId);
    const {
      userId: waitingMFAUserId,
      authProviderId,
      mfaProviderIds,
    } = WatingMFAPayloadSchema.parse(await redis.hGetAll(waitingMFASessionKey));

    const successMFASessionId = helpers.getCookie("successMFASessionId");
    helpers.delCookie("successMFASessionId");
    if (!successMFASessionId)
      throw new ORPCError("UNAUTHORIZED", {
        message: `No successMFASessionId provided`,
      });

    const successMFASessionKey = getSuccessMFASessionKey(successMFASessionId);
    const { userId: mfaUserId, mfaProviderId } = SuccessMFAPayloadSchema.parse(
      await redis.hGetAll(successMFASessionKey),
    );
    await redis.del(successMFASessionKey);

    if (waitingMFAUserId !== mfaUserId)
      throw new ORPCError("BAD_REQUEST", {
        message: "User ID mismatch between waiting and success MFA sessions",
      });

    const allowedMFAProviderIds = z
      .array(z.int())
      .parse(JSON.parse(mfaProviderIds));
    if (!allowedMFAProviderIds.includes(mfaProviderId))
      throw new ORPCError("BAD_REQUEST", {
        message: `MFA Provider ${mfaProviderId} is not allowed`,
      });

    await finishLogin(
      redis,
      waitingMFAUserId,
      { mfaProviderId, authProviderId },
      helpers,
    );
  });

export const logout = authed.output(z.void()).handler(async ({ context }) => {
  const {
    redisDB: { redis },
    sessionId,
    pluginManager,
    helpers,
  } = context;

  const sessionKey = `user:session:${sessionId}`;

  // 也有不存在 authProviderId 的时候，比如通过注册自动登录
  const authProviderIdData = await redis.hGet(sessionKey, "authProviderId");
  if (authProviderIdData) {
    const authProviderId = Number(authProviderIdData);

    const provider = getServiceFromDBId<AuthProvider>(
      pluginManager,
      authProviderId,
    );

    if (typeof provider.handleLogout === "function") {
      await provider.handleLogout({ sessionId });
    }
  }

  await redis.del(`user:session:${sessionId}`);
  helpers.delCookie("sessionId");
});

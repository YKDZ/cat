import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { JSONSchemaSchema, safeZDotJson } from "@cat/shared/schema/json";
import type { AuthProvider, MFAProvider } from "@cat/plugin-core";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import {
  account as accountTable,
  and,
  eq,
  hashPassword,
  or,
  user as userTable,
  type RedisClientType,
} from "@cat/db";
import {
  assertSingleNonNullish,
  assertSingleOrNull,
  type HTTPHelpers,
} from "@cat/shared/utils";
import { authedProcedure, publicProcedure, router } from "@/trpc/server.ts";
import { HashTypeSchema, type RedisPayload } from "@cat/shared/schema/redis";

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
  })
  .catchall(HashTypeSchema);
type WaitingMFAPayload = z.infer<typeof WatingMFAPayloadSchema>;

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        email: z.email(),
        name: z.string(),
        password: z.string(),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        redisDB: { redis },
        drizzleDB: { client: drizzle },
        pluginRegistry,
        helpers,
      } = ctx;
      const { email, name, password } = input;

      const authProviderId = await pluginRegistry.getPluginServiceDbId(
        drizzle,
        "password-auth-provider",
        "PASSWORD",
      );

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
              authProviderId,
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
          authProviderId,
        },
        helpers,
      );
    }),
  preAuth: publicProcedure
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
    .mutation(async ({ ctx, input }) => {
      const {
        redisDB: { redis },
        drizzleDB: { client: drizzle },
        pluginRegistry,
        helpers: { setCookie },
      } = ctx;
      const { identifier, authProviderId } = input;

      if (ctx.user)
        throw new TRPCError({ code: "CONFLICT", message: "Already login" });

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

      const provider = await getServiceFromDBId<AuthProvider>(
        drizzle,
        pluginRegistry,
        authProviderId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${authProviderId} does not exists`,
        });

      const sessionId = randomBytes(32).toString("hex");

      if (typeof provider.handlePreAuth === "function") {
        const { passToClient, meta } = await provider.handlePreAuth(identifier);

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
    }),
  getAuthFormSchema: publicProcedure
    .input(
      z.object({
        providerId: z.int(),
      }),
    )
    .output(JSONSchemaSchema)
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { providerId } = input;

      const provider = await getServiceFromDBId<AuthProvider>(
        drizzle,
        pluginRegistry,
        providerId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      if (typeof provider.getAuthFormSchema !== "function") return {};

      return provider.getAuthFormSchema();
    }),
  auth: publicProcedure
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
    .mutation(async ({ ctx, input }) => {
      const {
        redisDB: { redis },
        drizzleDB: { client: drizzle },
        helpers,
        pluginRegistry,
      } = ctx;
      const { passToServer } = input;

      if (ctx.user)
        throw new TRPCError({ code: "CONFLICT", message: "Already logged in" });

      const preAuthSessionId = helpers.getCookie("preAuthSessionId");

      if (!preAuthSessionId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Pre-auth session ID not found",
        });

      const preAuthSessionKey = getPreAuthSessionKey(preAuthSessionId);
      helpers.delCookie("preAuthSessionId");

      const { userId, identifier, authProviderId, meta } =
        PreAuthSessionPayloadSchema.parse(
          await redis.hGetAll(preAuthSessionKey),
        );
      await redis.del(preAuthSessionKey);

      const provider = await getServiceFromDBId<AuthProvider>(
        drizzle,
        pluginRegistry,
        authProviderId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
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

      // TODO 检查用户是否配置了 MFA 提供器
      if (pluginRegistry.getPluginServices("MFA_PROVIDER").length > 0) {
        const waitingMFASessionId = randomBytes(32).toString("hex");
        const waitingMFASessionKey =
          getWaitingMFASessionKey(waitingMFASessionId);

        await redis.hSet(waitingMFASessionKey, {
          userId,
          authProviderId,
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
    }),
  preMFA: publicProcedure
    .input(
      z.object({
        userId: z.uuidv4(),
        mfaProviderId: z.int(),
      }),
    )
    .output(
      z.object({
        gotFromServer: safeZDotJson,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        redisDB: { redis },
        pluginRegistry,
        helpers,
      } = ctx;
      const { userId, mfaProviderId } = input;

      const provider = await getServiceFromDBId<MFAProvider>(
        drizzle,
        pluginRegistry,
        mfaProviderId,
      );

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
    }),
  getMFAFormSchema: publicProcedure
    .input(
      z.object({
        mfaProviderId: z.int(),
      }),
    )
    .output(JSONSchemaSchema)
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { mfaProviderId } = input;

      const provider = await getServiceFromDBId<MFAProvider>(
        drizzle,
        pluginRegistry,
        mfaProviderId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `MFA Provider ${mfaProviderId} does not exists`,
        });

      if (typeof provider.getVerfifyChallengeFormSchema !== "function")
        return {};

      return provider.getVerfifyChallengeFormSchema();
    }),
  mfa: publicProcedure
    .input(
      z.object({
        passToServer: z.object({
          formData: safeZDotJson.optional(),
        }),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        redisDB: { redis },
        pluginRegistry,
        helpers,
      } = ctx;
      const { passToServer } = input;

      const sessionId = helpers.getCookie("preMFASessionId");

      if (!sessionId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: `No sessionId provided`,
        });

      const sessionKey = getPreMFASessionKey(sessionId);
      const { userId, mfaProviderId, meta } = PreMFAPayloadSchema.parse(
        await redis.hGetAll(sessionKey),
      );
      await redis.del(sessionKey);
      helpers.delCookie("preMFASessionId");

      const provider = await getServiceFromDBId<MFAProvider>(
        drizzle,
        pluginRegistry,
        mfaProviderId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `MFA Provider ${mfaProviderId} does not exists`,
        });

      const { isSuccess } = await provider.verifyChallenge(
        passToServer,
        z.json().parse(JSON.parse(meta)),
      );

      if (!isSuccess)
        throw new TRPCError({
          code: "UNAUTHORIZED",
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
    }),
  completeAuthWithMFA: publicProcedure
    .output(z.void())
    .mutation(async ({ ctx }) => {
      const {
        redisDB: { redis },
        helpers,
      } = ctx;

      const waitingMFASessionId = helpers.getCookie("waitingMFASessionId");
      helpers.delCookie("waitingMFASessionId");

      if (!waitingMFASessionId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No waitingMFASessionId provided",
        });

      const waitingMFASessionKey = getWaitingMFASessionKey(waitingMFASessionId);
      const { userId: waitingMFAUserId, authProviderId } =
        WatingMFAPayloadSchema.parse(await redis.hGetAll(waitingMFASessionKey));

      const successMFASessionId = helpers.getCookie("successMFASessionId");
      helpers.delCookie("successMFASessionId");
      if (!successMFASessionId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: `No successMFASessionId provided`,
        });

      const successMFASessionKey = getSuccessMFASessionKey(successMFASessionId);
      const { userId: mfaUserId, mfaProviderId } =
        SuccessMFAPayloadSchema.parse(
          await redis.hGetAll(successMFASessionKey),
        );
      await redis.del(successMFASessionKey);

      if (waitingMFAUserId !== mfaUserId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User ID mismatch between waiting and success MFA sessions",
        });

      await finishLogin(
        redis,
        waitingMFAUserId,
        { mfaProviderId, authProviderId },
        helpers,
      );
    }),
  logout: authedProcedure.output(z.void()).mutation(async ({ ctx }) => {
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redis },
      sessionId,
      pluginRegistry,
      helpers,
    } = ctx;

    const sessionKey = `user:session:${sessionId}`;

    // 也有不存在 authProviderId 的时候，比如通过注册自动登录
    const authProviderIdData = await redis.hGet(sessionKey, "authProviderId");
    if (authProviderIdData) {
      const authProviderId = Number(authProviderIdData);

      const provider = await getServiceFromDBId<AuthProvider>(
        drizzle,
        pluginRegistry,
        authProviderId,
      );

      if (typeof provider.handleLogout === "function") {
        await provider.handleLogout(sessionId);
      }
    }

    await redis.del(`user:session:${sessionId}`);
    helpers.delCookie("sessionId");
  }),
});

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

import type { MFAProvider } from "@cat/plugin-core";

import {
  createMfaProvider,
  executeCommand,
  executeQuery,
  getMfaProviderByServiceAndUser,
} from "@cat/domain";
import { getServiceFromDBId } from "@cat/server-shared";
import { JSONSchemaSchema, safeZDotJson } from "@cat/shared/schema/json";
import { ORPCError } from "@orpc/client";
import { randomBytes } from "node:crypto";
import * as z from "zod/v4";

import { authed, base } from "@/orpc/server";

import {
  finishLogin,
  PreInitMFAPayloadSchema,
  PreMFAPayloadSchema,
  sessionKeys,
  SuccessMFAPayloadSchema,
  WaitingMFAPayloadSchema,
} from "./schemas.ts";

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
    const { sessionStore, pluginManager, helpers } = context;
    const { userId, mfaProviderId } = input;

    const provider = getServiceFromDBId<MFAProvider>(
      pluginManager,
      mfaProviderId,
    );

    if (typeof provider.generateChallenge !== "function") return;

    const sessionId = randomBytes(32).toString("hex");
    const sessionKey = sessionKeys.preMFA(sessionId);

    const { passToClient, meta } = await provider.generateChallenge();

    await sessionStore.create(
      sessionKey,
      {
        userId,
        mfaProviderId: String(mfaProviderId),
        meta: JSON.stringify(meta),
      },
      5 * 60,
    );

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
    const { sessionStore, pluginManager, user, helpers } = context;
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
    const sessionKey = sessionKeys.preInitMFA(sessionId);

    await sessionStore.create(
      sessionKey,
      {
        userId: user.id,
        mfaProviderId: String(mfaProviderId),
        payload: JSON.stringify(result.payload),
      },
      5 * 60,
    );

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
      sessionStore,
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

    const sessionKey = sessionKeys.preInitMFA(sessionId);
    const { payload, mfaProviderId, userId } = PreInitMFAPayloadSchema.parse(
      await sessionStore.getAll(sessionKey),
    );
    await sessionStore.destroy(sessionKey);

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

    await executeCommand({ db: drizzle }, createMfaProvider, {
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
      sessionStore,
      pluginManager,
      helpers,
    } = context;
    const { passToServer } = input;

    const sessionId = helpers.getCookie("preMFASessionId");

    if (!sessionId)
      throw new ORPCError("UNAUTHORIZED", {
        message: `No sessionId provided`,
      });

    const sessionKey = sessionKeys.preMFA(sessionId);
    const { userId, mfaProviderId, meta } = PreMFAPayloadSchema.parse(
      await sessionStore.getAll(sessionKey),
    );
    await sessionStore.destroy(sessionKey);
    helpers.delCookie("preMFASessionId");

    const provider = getServiceFromDBId<MFAProvider>(
      pluginManager,
      mfaProviderId,
    );

    if (!provider)
      throw new ORPCError("BAD_REQUEST", {
        message: `MFA Provider ${mfaProviderId} does not exists`,
      });

    const dbProvider = await executeQuery(
      { db: drizzle },
      getMfaProviderByServiceAndUser,
      {
        userId,
        mfaServiceId: mfaProviderId,
      },
    );

    if (dbProvider === null) {
      throw new ORPCError("NOT_FOUND", {
        message: `MFA Provider ${mfaProviderId} is not initialized for user`,
      });
    }

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
    const successMFASessionKey = sessionKeys.successMFA(successMFASessionId);
    await sessionStore.create(
      successMFASessionKey,
      {
        succeedAt: String(Date.now()),
        mfaProviderId: String(mfaProviderId),
        userId,
      },
      5 * 60,
    );

    helpers.setCookie("successMFASessionId", successMFASessionId);
  });

export const completeAuthWithMFA = base
  .output(z.void())
  .handler(async ({ context }) => {
    const {
      sessionStore,
      drizzleDB: { client: drizzle },
      helpers,
    } = context;

    const waitingMFASessionId = helpers.getCookie("waitingMFASessionId");
    helpers.delCookie("waitingMFASessionId");

    if (!waitingMFASessionId)
      throw new ORPCError("UNAUTHORIZED", {
        message: "No waitingMFASessionId provided",
      });

    const waitingMFASessionKey = sessionKeys.waitingMFA(waitingMFASessionId);
    const {
      userId: waitingMFAUserId,
      authProviderId,
      mfaProviderIds,
    } = WaitingMFAPayloadSchema.parse(
      await sessionStore.getAll(waitingMFASessionKey),
    );

    const successMFASessionId = helpers.getCookie("successMFASessionId");
    helpers.delCookie("successMFASessionId");
    if (!successMFASessionId)
      throw new ORPCError("UNAUTHORIZED", {
        message: `No successMFASessionId provided`,
      });

    const successMFASessionKey = sessionKeys.successMFA(successMFASessionId);
    const { userId: mfaUserId, mfaProviderId } = SuccessMFAPayloadSchema.parse(
      await sessionStore.getAll(successMFASessionKey),
    );
    await sessionStore.destroy(successMFASessionKey);

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
      sessionStore,
      drizzle,
      waitingMFAUserId,
      { mfaProviderId, authProviderId },
      helpers,
    );
  });

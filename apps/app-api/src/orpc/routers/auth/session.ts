import type { AuthProvider } from "@cat/plugin-core";

import {
  executeCommand,
  executeQuery,
  listSessionsByUser,
  revokeSessionRecord,
} from "@cat/domain";
import { getServiceFromDBId } from "@cat/server-shared";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

import { sessionKeys } from "./schemas.ts";

export const logout = authed.output(z.void()).handler(async ({ context }) => {
  const { sessionStore, sessionId, pluginManager, helpers } = context;

  const sessionKey = sessionKeys.userSession(sessionId);

  // 也有不存在 authProviderId 的时候，比如通过注册自动登录
  const authProviderIdData = await sessionStore.getField(
    sessionKey,
    "authProviderId",
  );
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

  await sessionStore.destroy(sessionKey);
  helpers.delCookie("sessionId");
});

export const listSessions = authed
  .output(
    z.array(
      z.object({
        id: z.string(),
        ip: z.string().nullable(),
        userAgent: z.string().nullable(),
        expiresAt: z.string(),
        createdAt: z.string(),
        isCurrent: z.boolean(),
      }),
    ),
  )
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
      sessionId,
    } = context;

    const sessions = await executeQuery({ db: drizzle }, listSessionsByUser, {
      userId: user.id,
    });

    return sessions.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.id === sessionId,
    }));
  });

export const revokeSession = authed
  .input(z.object({ sessionId: z.string() }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      sessionId: currentSessionId,
      user,
    } = context;

    if (input.sessionId === currentSessionId)
      throw new ORPCError("BAD_REQUEST", {
        message: "Cannot revoke current session; use logout instead",
      });

    // 销毁 Redis 中的 session
    const sessionKey = sessionKeys.userSession(input.sessionId);
    await sessionStore.destroy(sessionKey);

    // 在 DB 中标记 revokedAt
    await executeCommand({ db: drizzle }, revokeSessionRecord, {
      id: input.sessionId,
      userId: user.id,
    });
  });

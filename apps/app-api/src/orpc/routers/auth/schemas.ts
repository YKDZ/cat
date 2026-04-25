import type { HTTPHelpers } from "@cat/shared";

import {
  createSessionRecord,
  executeCommand,
  type DrizzleClient,
  type SessionStore,
} from "@cat/domain";
import { randomBytes } from "node:crypto";
import * as z from "zod";

// ====== Session Key 工厂 ======
export const sessionKeys = {
  preAuth: (id: string) => `auth:preAuth:session:${id}`,
  preMFA: (id: string) => `auth:preMFA:session:${id}`,
  successMFA: (id: string) => `mfa:success:${id}`,
  waitingMFA: (id: string) => `auth:waitingMFA:${id}`,
  preInitMFA: (id: string) => `auth:preInitMFA:${id}`,
  userSession: (id: string) => `user:session:${id}`,
} as const;

// ====== 临时会话 Payload Schemas ======
export const PreAuthSessionPayloadSchema = z
  .object({
    // userId 可能为空（OIDC 自动注册场景：首次登录时用户尚不存在）
    userId: z.string().optional(),
    authProviderId: z.coerce.number().int(),
    identifier: z.string(),
    meta: z.string(),
  })
  .catchall(z.string());

export const PreMFAPayloadSchema = z
  .object({
    userId: z.uuidv4(),
    mfaProviderId: z.coerce.number().int(),
    meta: z.string(),
  })
  .catchall(z.string());

export const SuccessMFAPayloadSchema = z
  .object({
    succeedAt: z.coerce.number().int(),
    mfaProviderId: z.coerce.number().int(),
    userId: z.uuidv4(),
  })
  .catchall(z.string());

export const WaitingMFAPayloadSchema = z
  .object({
    userId: z.uuidv4(),
    authProviderId: z.coerce.number().int(),
    mfaProviderIds: z.string(),
  })
  .catchall(z.string());

export const PreInitMFAPayloadSchema = z.object({
  userId: z.uuidv4(),
  mfaProviderId: z.coerce.number().int(),
  payload: z.string(),
});

// ====== 通用工具 ======
export const finishLogin = async (
  sessionStore: SessionStore,
  db: DrizzleClient,
  userId: string,
  meta: Record<string, string | number> & {
    authProviderId: number;
  },
  helpers: HTTPHelpers,
): Promise<string> => {
  const sessionId = randomBytes(32).toString("hex");
  const sessionKey = sessionKeys.userSession(sessionId);

  await sessionStore.create(sessionKey, { userId, ...meta }, 24 * 60 * 60);

  helpers.setCookie("sessionId", sessionId);

  // 异步写入 DB SessionRecord（不阻塞登录响应）
  const ip =
    helpers.getReqHeader("x-forwarded-for") ??
    helpers.getReqHeader("x-real-ip") ??
    null;
  const userAgent = helpers.getReqHeader("user-agent") ?? null;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  executeCommand({ db }, createSessionRecord, {
    id: sessionId,
    userId,
    ip,
    userAgent,
    authProviderId: meta.authProviderId ?? null,
    expiresAt,
  }).catch((_err: unknown) => {
    // ignore: fire-and-forget, session record persistence failure should not block login
  });

  return sessionId;
};

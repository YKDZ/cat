import { randomBytes } from "node:crypto";

import {
  createSessionRecord,
  executeCommand,
  type DrizzleClient,
  type SessionStore,
} from "@cat/domain";
import {
  ServiceImplementationReferenceSchema,
  type HTTPHelpers,
  type ServiceImplementationReference,
} from "@cat/shared";
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
    authProvider: ServiceImplementationReferenceSchema,
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
    authProvider: ServiceImplementationReferenceSchema,
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
  meta: Record<string, string | number | ServiceImplementationReference> & {
    authProvider: ServiceImplementationReference;
  },
  helpers: HTTPHelpers,
): Promise<string> => {
  const sessionId = randomBytes(32).toString("hex");
  const sessionKey = sessionKeys.userSession(sessionId);

  const { authProvider: _authProvider, ...sessionMeta } = meta;
  await sessionStore.create(
    sessionKey,
    {
      userId,
      ...sessionMeta,
      // This is display/audit metadata only; runtime resolution always uses
      // the JSONB reference persisted in SessionRecord.
      authProviderReference: JSON.stringify(meta.authProvider),
    },
    24 * 60 * 60,
  );

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
    authProvider: meta.authProvider,
    expiresAt,
  }).catch((_err: unknown) => {
    // ignore: fire-and-forget, session record persistence failure should not block login
  });

  return sessionId;
};

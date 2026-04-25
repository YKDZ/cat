import type { User } from "@cat/shared";

import {
  executeCommand,
  executeQuery,
  getApiKeyByHash,
  getUser,
  updateApiKeyLastUsed,
  type DbHandle,
} from "@cat/domain";
import { UserSchema } from "@cat/shared";
import { createHash } from "node:crypto";

export const hashApiKey = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex");

export const resolveApiKey = async (
  db: DbHandle,
  rawKey: string,
): Promise<{ user: User; scopes: string[]; apiKeyId: number } | null> => {
  const keyHash = hashApiKey(rawKey);
  const record = await executeQuery({ db }, getApiKeyByHash, { keyHash });

  if (!record) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  const userRaw = await executeQuery({ db }, getUser, {
    userId: record.userId,
  });
  const user = UserSchema.nullable().parse(userRaw);
  if (!user) return null;

  return { user, scopes: record.scopes, apiKeyId: record.id };
};

export const updateApiKeyLastUsedAsync = (
  db: DbHandle,
  apiKeyId: number,
): void => {
  executeCommand({ db }, updateApiKeyLastUsed, { id: apiKeyId }).catch(() => {
    // ignore
  });
};

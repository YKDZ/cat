import {
  createApiKey,
  executeCommand,
  executeQuery,
  listApiKeysByUser,
  revokeApiKey,
} from "@cat/domain";
import { createHash, randomBytes } from "node:crypto";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

export const createApiKeyEndpoint = authed
  .input(
    z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.string()).default([]),
      expiresInDays: z.int().min(1).max(365).optional(),
    }),
  )
  .output(
    z.object({
      id: z.int(),
      rawKey: z.string(),
      keyPrefix: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const rawKey = `cat_${randomBytes(32).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 12);
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const { id } = await executeCommand({ db: drizzle }, createApiKey, {
      name: input.name,
      keyHash,
      keyPrefix,
      userId: user.id,
      scopes: input.scopes,
      expiresAt,
    });

    return { id, rawKey, keyPrefix };
  });

export const listApiKeysEndpoint = authed
  .output(
    z.array(
      z.object({
        id: z.int(),
        name: z.string(),
        keyPrefix: z.string(),
        scopes: z.array(z.string()),
        expiresAt: z.string().nullable(),
        lastUsedAt: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
  )
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const keys = await executeQuery({ db: drizzle }, listApiKeysByUser, {
      userId: user.id,
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }));
  });

export const revokeApiKeyEndpoint = authed
  .input(z.object({ id: z.int() }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    await executeCommand({ db: drizzle }, revokeApiKey, {
      id: input.id,
      userId: user.id,
    });
  });

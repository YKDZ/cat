import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "../misc.ts";

export const ApiKeySchema = z.object({
  id: z.int(),
  name: z.string(),
  keyHash: z.string(),
  keyPrefix: z.string(),
  userId: z.uuidv4(),
  scopes: z.array(z.string()),
  expiresAt: DrizzleDateTimeSchema.nullable(),
  lastUsedAt: DrizzleDateTimeSchema.nullable(),
  revokedAt: DrizzleDateTimeSchema.nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const SessionRecordSchema = z.object({
  id: z.string(),
  userId: z.uuidv4(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  authProviderId: z.int().nullable(),
  expiresAt: DrizzleDateTimeSchema,
  revokedAt: DrizzleDateTimeSchema.nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

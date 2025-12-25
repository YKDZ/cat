import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";
import { nonNullSafeZDotJson } from "@/schema/json";

export const UserSchema = z.object({
  id: z.uuidv4(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  avatarFileId: z.int().nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const AccountSchema = z.object({
  id: z.int(),
  providerIssuer: z.string(),
  providedAccountId: z.string(),
  authProviderId: z.string(),
  userId: z.uuidv4(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const MFAProviderSchema = z.object({
  id: z.int(),
  failureCount: z.int().min(0),
  lastUsedAt: DrizzleDateTimeSchema.nullable(),
  payload: nonNullSafeZDotJson,
  mfaServiceId: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type User = z.infer<typeof UserSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type MFAProvider = z.infer<typeof MFAProviderSchema>;

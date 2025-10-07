import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";

export const UserSchema = z.object({
  id: z.uuidv7(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const AccountSchema = z.object({
  type: z.string(),
  provider: z.string(),
  providedAccountId: z.string(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  userId: z.uuidv7(),
});

export type User = z.infer<typeof UserSchema>;
export type Account = z.infer<typeof AccountSchema>;

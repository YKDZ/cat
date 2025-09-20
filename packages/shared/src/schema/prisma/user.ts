import * as z from "zod/v4";
import { PrismaDateTime } from "@/schema/misc.ts";

export const UserSchema = z.object({
  id: z.ulid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
});

export const AccountSchema = z.object({
  type: z.string(),
  provider: z.string(),
  providedAccountId: z.string(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  userId: z.ulid(),
});

export type User = z.infer<typeof UserSchema>;
export type Account = z.infer<typeof AccountSchema>;

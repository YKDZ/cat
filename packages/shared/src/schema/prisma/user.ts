import * as z from "zod/v4";
import { LanguageSchema } from "./misc.ts";
import { TranslationVoteSchema } from "./translation.ts";
import { PrismaDateTime } from "@/schema/misc.ts";

export const UserSchema = z.object({
  id: z.ulid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  get WritableLanguages() {
    return z.array(LanguageSchema).optional();
  },
  get ReadableLanguages() {
    return z.array(LanguageSchema).optional();
  },
  get TranslationVotes() {
    return z.array(TranslationVoteSchema).optional();
  },
});

export const AccountSchema = z.object({
  type: z.string(),
  provider: z.string(),
  providedAccountId: z.string(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  userId: z.ulid(),
  get User() {
    return UserSchema.optional();
  },
});

export type User = z.infer<typeof UserSchema>;
export type Account = z.infer<typeof AccountSchema>;

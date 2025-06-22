import z from "zod/v4";
import { PrimsaDateTime } from "../misc";
import { LanguageSchema, PermissionSchema } from "./misc";
import { TranslationVoteSchema } from "./translation";

export const UserSchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  get WritableLanguages() {
    return z.array(LanguageSchema).optional();
  },
  get ReadableLanguages() {
    return z.array(LanguageSchema).optional();
  },
  get Permissions() {
    return z.array(PermissionSchema).optional();
  },
  get TranslationVotes() {
    return z.array(TranslationVoteSchema).optional();
  },
});

export const AccountSchema = z.object({
  type: z.string(),
  provider: z.string(),
  providedAccountId: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  userId: z.cuid2(),
  get User() {
    return UserSchema.optional();
  },
});

export type User = z.infer<typeof UserSchema>;
export type Account = z.infer<typeof AccountSchema>;

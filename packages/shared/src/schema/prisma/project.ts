import * as z from "zod/v4";
import { MemorySchema } from "./memory.ts";
import { LanguageSchema } from "./misc.ts";
import { UserSchema } from "./user.ts";
import { DocumentSchema } from "./document.ts";
import { PrismaDateTime } from "@/schema/misc.ts";

export const ProjectSchema = z.object({
  id: z.ulid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  sourceLanguageId: z.string(),
  get SourceLanguage() {
    return LanguageSchema.optional();
  },

  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },

  get Members() {
    return z.array(UserSchema).optional();
  },

  get TargetLanguages() {
    return z.array(LanguageSchema).optional();
  },

  get Documents() {
    return z.array(DocumentSchema).optional();
  },

  get Memories() {
    return z.array(MemorySchema).optional();
  },
});

export type Project = z.infer<typeof ProjectSchema>;

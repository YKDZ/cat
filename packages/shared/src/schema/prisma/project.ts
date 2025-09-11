import z from "zod";
import { MemorySchema } from "./memory.ts";
import { LanguageSchema } from "./misc.ts";
import { PrimsaDateTime } from "../misc.ts";
import { UserSchema } from "./user.ts";
import { DocumentSchema } from "./document.ts";

export const ProjectSchema = z.object({
  id: z.ulid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

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

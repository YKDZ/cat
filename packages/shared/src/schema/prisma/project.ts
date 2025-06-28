import z from "zod/v4";
import { MemorySchema } from "./memory";
import { LanguageSchema } from "./misc";
import { PrimsaDateTime } from "../misc";
import { UserSchema } from "./user";
import { DocumentSchema } from "./document";

export const ProjectSchema = z.object({
  id: z.ulid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  get Memories() {
    return z.array(MemorySchema).optional();
  },
  sourceLanguageId: z.string(),
  get SourceLanguage() {
    return LanguageSchema.optional();
  },
  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },
  get TargetLanguages() {
    return z.array(LanguageSchema).optional();
  },
  get Documents() {
    return z.array(DocumentSchema).optional();
  },
});

export type Project = z.infer<typeof ProjectSchema>;

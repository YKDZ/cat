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

  creatorId: z.ulid(),
});

export type Project = z.infer<typeof ProjectSchema>;

import * as z from "zod/v4";
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

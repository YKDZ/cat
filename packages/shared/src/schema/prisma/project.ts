import * as z from "zod/v4";
import { PrismaDateTime } from "@/schema/misc.ts";

export const ProjectSchema = z.object({
  id: z.uuidv7(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  creatorId: z.uuidv7(),
});

export type Project = z.infer<typeof ProjectSchema>;

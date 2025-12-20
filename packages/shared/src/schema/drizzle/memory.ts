import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";

export const MemoryItemSchema = z.object({
  id: z.int(),
  sourceStringId: z.int(),
  translationStringId: z.int(),
  memoryId: z.uuidv4(),
  creatorId: z.uuidv4(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const MemorySchema = z.object({
  id: z.uuidv4(),
  name: z.string(),
  description: z.string().nullable(),
  creatorId: z.uuidv4(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

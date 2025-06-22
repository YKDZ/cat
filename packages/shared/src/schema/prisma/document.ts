import z from "zod/v4";
import { PrimsaDateTime } from "../misc";
import { FileSchema } from "./file";
import { UserSchema } from "./user";
import { VectorSchema } from "./vector";

export const DocumentSchema = z.object({
  id: z.cuid2(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
  get TranslatableElements() {
    return z.array(TranslatableElementSchema).optional();
  },
  get File() {
    return FileSchema.optional();
  },
  projectId: z.string(),
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  value: z.string(),
  meta: z.json(),
  embeddingId: z.int(),
  version: z.int(),
  isActive: z.boolean(),
  previousVersionId: z.int().nullable(),
  get Embedding() {
    return VectorSchema.optional();
  },
});

export type Document = z.infer<typeof DocumentSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;

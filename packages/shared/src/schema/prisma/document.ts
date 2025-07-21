import z from "zod";
import { PrimsaDateTime } from "../misc";
import { FileSchema } from "./file";
import { UserSchema } from "./user";
import { VectorSchema } from "./vector";

export const DocumentSchema = z.object({
  id: z.ulid(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.ulid(),
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

export const DocumentVersionSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  documentId: z.ulid(),
  get Document() {
    return DocumentSchema.optional();
  },
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;

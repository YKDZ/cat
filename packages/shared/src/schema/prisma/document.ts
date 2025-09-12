import z from "zod";
import { PrimsaDateTime } from "../misc.ts";
import { FileSchema } from "./file.ts";
import { UserSchema } from "./user.ts";
import { VectorSchema } from "./vector.ts";
import { ProjectSchema } from "./project.ts";

export const DocumentSchema = z.object({
  id: z.ulid(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

  get File() {
    return FileSchema.nullable().optional();
  },

  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },

  projectId: z.string(),
  get Project() {
    return ProjectSchema.optional();
  },

  get TranslatableElements() {
    return z.array(TranslatableElementSchema).optional();
  },
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  value: z.string(),
  sortIndex: z.int(),
  meta: z.json(),
  embeddingId: z.int(),
  version: z.int(),
  isActive: z.boolean(),

  previousVersionId: z.int().nullable(),
  get Embedding() {
    return VectorSchema.optional();
  },

  documentVersionId: z.int(),
  get DocumentVersion() {
    return DocumentVersionSchema.optional();
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

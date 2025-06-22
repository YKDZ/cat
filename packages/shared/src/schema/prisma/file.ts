import z from "zod/v4";
import { PrimsaDateTime } from "../misc";

export const FileSchema = z.object({
  id: z.int(),
  originName: z.string(),
  storedPath: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

  typeId: z.int(),
  get Type() {
    return FileTypeSchema.optional();
  },

  storageTypeId: z.int(),
  get StorageType() {
    return StorageTypeSchema.optional();
  },

  documentId: z.cuid2().nullable(),
  userId: z.cuid2().nullable(),
});

export const FileTypeSchema = z.object({
  id: z.int(),
  name: z.string(),
  mimeType: z.string(),
  icon: z.string(),
});

export const StorageTypeSchema = z.object({
  id: z.int(),
  name: z.string(),
});

export type File = z.infer<typeof FileSchema>;
export type FileType = z.infer<typeof FileTypeSchema>;
export type StorageType = z.infer<typeof StorageTypeSchema>;

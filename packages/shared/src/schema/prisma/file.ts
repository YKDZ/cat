import z from "zod";
import { PrimsaDateTime } from "../misc";

export const FileSchema = z.object({
  id: z.int(),
  originName: z.string(),
  storedPath: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

  storageTypeId: z.int(),
  get StorageType() {
    return StorageTypeSchema.optional();
  },

  documentId: z.ulid().nullable(),
  userId: z.ulid().nullable(),
});

export const StorageTypeSchema = z.object({
  id: z.int(),
  name: z.string(),
});

export type File = z.infer<typeof FileSchema>;
export type StorageType = z.infer<typeof StorageTypeSchema>;

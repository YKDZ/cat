import z from "zod";
import { PrismaDateTime } from "./misc.ts";
import { StorageProviderSchema } from "./plugin.ts";

export const FileSchema = z.object({
  id: z.int(),
  originName: z.string(),
  storedPath: z.string(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  storageProviderId: z.int(),
  get StorageProvider() {
    return StorageProviderSchema.optional();
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

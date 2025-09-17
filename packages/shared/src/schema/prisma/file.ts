import z from "zod";
import { PrismaDateTime } from "./misc.ts";
import { PluginServiceSchema } from "@/schema/prisma/plugin.ts";
import { DocumentSchema } from "@/schema/prisma/document.ts";
import { UserSchema } from "@/schema/prisma/user.ts";

export const FileSchema = z.object({
  id: z.int(),
  originName: z.string(),
  storedPath: z.string(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  storageProviderId: z.int(),
  get StorageProvider() {
    return PluginServiceSchema.optional();
  },

  documentId: z.ulid().nullable(),
  get Document() {
    return DocumentSchema.optional();
  },

  userId: z.ulid().nullable(),
  get User() {
    return UserSchema.optional();
  },
});

export type File = z.infer<typeof FileSchema>;

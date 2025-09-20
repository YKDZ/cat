import * as z from "zod/v4";
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

  documentId: z.ulid().nullable(),

  userId: z.ulid().nullable(),
});

export type File = z.infer<typeof FileSchema>;

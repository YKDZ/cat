import * as z from "zod/v4";
import { PrismaDateTime } from "./misc.ts";

export const FileSchema = z.object({
  id: z.int(),
  originName: z.string(),
  storedPath: z.string(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  storageProviderId: z.int(),

  documentId: z.uuidv7().nullable(),

  userId: z.uuidv7().nullable(),
});

export type File = z.infer<typeof FileSchema>;

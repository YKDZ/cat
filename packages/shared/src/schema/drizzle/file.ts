import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "../misc.ts";

export const FileSchema = z.object({
  id: z.int(),
  originName: z.string(),
  storedPath: z.string(),
  storageProviderId: z.int(),
  documentId: z.uuidv7().nullable(),
  userId: z.uuidv7().nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type File = z.infer<typeof FileSchema>;

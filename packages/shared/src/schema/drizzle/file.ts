import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "../misc.ts";

export const FileSchema = z.object({
  id: z.int(),
  name: z.string(),
  blobId: z.int(),
  isActive: z.boolean(),
  createdAt: DrizzleDateTimeSchema,
});

export const Blob = z.object({
  id: z.int(),
  key: z.string(),
  storageProviderId: z.int(),
  hash: z.instanceof(Buffer),
  createdAt: DrizzleDateTimeSchema,
});

export type File = z.infer<typeof FileSchema>;
export type Blob = z.infer<typeof Blob>;

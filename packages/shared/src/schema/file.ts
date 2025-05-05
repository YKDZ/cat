import { z } from "zod";

export const FileMetaSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
});

export type FileMeta = z.infer<typeof FileMetaSchema>;

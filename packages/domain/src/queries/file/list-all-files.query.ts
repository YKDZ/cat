import { file } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListAllFilesQuerySchema = z.object({});

export type ListAllFilesQuery = z.infer<typeof ListAllFilesQuerySchema>;

export const listAllFiles: Query<
  ListAllFilesQuery,
  Array<typeof file.$inferSelect>
> = async (ctx, _query) => {
  return ctx.db.select().from(file);
};

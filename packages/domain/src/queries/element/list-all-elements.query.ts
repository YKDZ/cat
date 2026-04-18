import { translatableElement } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListAllElementsQuerySchema = z.object({});

export type ListAllElementsQuery = z.infer<typeof ListAllElementsQuerySchema>;

export const listAllElements: Query<
  ListAllElementsQuery,
  Array<typeof translatableElement.$inferSelect>
> = async (ctx, _query) => {
  return ctx.db.select().from(translatableElement);
};

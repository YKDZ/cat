import { asc, language } from "@cat/db";

import type { Query } from "@/types";

export const listAllLanguages: Query<
  Record<string, never>,
  Array<typeof language.$inferSelect>
> = async (ctx) =>
  await ctx.db.select().from(language).orderBy(asc(language.id));

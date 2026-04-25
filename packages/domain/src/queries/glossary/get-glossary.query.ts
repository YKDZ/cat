import { eq, glossary } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetGlossaryQuerySchema = z.object({
  glossaryId: z.uuidv4(),
});

export type GetGlossaryQuery = z.infer<typeof GetGlossaryQuerySchema>;

export const getGlossary: Query<
  GetGlossaryQuery,
  typeof glossary.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select()
      .from(glossary)
      .where(eq(glossary.id, query.glossaryId)),
  );
};

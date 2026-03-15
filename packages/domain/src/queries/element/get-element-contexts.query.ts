import { eq, translatableElement, translatableElementContext } from "@cat/db";
import { type TranslatableElementContext } from "@cat/shared/schema/drizzle/document";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetElementContextsQuerySchema = z.object({
  elementId: z.int(),
});

export type GetElementContextsQuery = z.infer<
  typeof GetElementContextsQuerySchema
>;

export type GetElementContextsResult = {
  element: {
    meta: typeof translatableElement.$inferSelect.meta;
    createdAt: typeof translatableElement.$inferSelect.createdAt;
    updatedAt: typeof translatableElement.$inferSelect.updatedAt;
  };
  contexts: TranslatableElementContext[];
};

export const getElementContexts: Query<
  GetElementContextsQuery,
  GetElementContextsResult
> = async (ctx, query) => {
  const [element, contexts] = await Promise.all([
    assertSingleNonNullish(
      await ctx.db
        .select({
          meta: translatableElement.meta,
          createdAt: translatableElement.createdAt,
          updatedAt: translatableElement.updatedAt,
        })
        .from(translatableElement)
        .where(eq(translatableElement.id, query.elementId)),
      `Element with ID ${query.elementId} not found`,
    ),
    ctx.db
      .select()
      .from(translatableElementContext)
      .where(
        eq(translatableElementContext.translatableElementId, query.elementId),
      ),
  ]);

  return {
    element,
    contexts,
  };
};

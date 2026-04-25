import type { TranslatableElementContext } from "@cat/shared";

import { eq, translatableElement, translatableElementContext } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

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
  const [elementRows, contexts] = await Promise.all([
    ctx.db
      .select({
        meta: translatableElement.meta,
        createdAt: translatableElement.createdAt,
        updatedAt: translatableElement.updatedAt,
      })
      .from(translatableElement)
      .where(eq(translatableElement.id, query.elementId)),
    ctx.db
      .select()
      .from(translatableElementContext)
      .where(
        eq(translatableElementContext.translatableElementId, query.elementId),
      ),
  ]);

  const element = assertSingleNonNullish(
    elementRows,
    `Element with ID ${query.elementId} not found`,
  );

  return {
    element,
    contexts,
  };
};

import { getColumns, qaReviewAnnotation, sql } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListQaReviewAnnotationsQuerySchema = z.object({
  queueItemId: z.int().positive(),
  includeHidden: z.boolean().default(false),
});

export type ListQaReviewAnnotationsQuery = z.infer<
  typeof ListQaReviewAnnotationsQuerySchema
>;

/**
 * List annotations under a queue item, hiding hidden annotations by default.
 */
export const listQaReviewAnnotations: Query<
  ListQaReviewAnnotationsQuery,
  Array<typeof qaReviewAnnotation.$inferSelect>
> = async (ctx, input) => {
  const query = ListQaReviewAnnotationsQuerySchema.parse(input);

  return await ctx.db
    .select({ ...getColumns(qaReviewAnnotation) })
    .from(qaReviewAnnotation)
    .where(
      sql`${qaReviewAnnotation.queueItemId} = ${query.queueItemId} AND ${
        query.includeHidden
          ? sql`TRUE`
          : sql`${qaReviewAnnotation.status} <> 'HIDDEN'`
      }`,
    )
    .orderBy(
      sql`${qaReviewAnnotation.rootAnnotationId} NULLS FIRST`,
      qaReviewAnnotation.createdAt,
      qaReviewAnnotation.id,
    );
};

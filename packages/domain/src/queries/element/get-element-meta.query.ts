import type { JSONType } from "@cat/shared/schema/json";

import { eq, translatableElement } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetElementMetaQuerySchema = z.object({
  elementId: z.int(),
});

export type GetElementMetaQuery = z.infer<typeof GetElementMetaQuerySchema>;

export const getElementMeta: Query<
  GetElementMetaQuery,
  JSONType | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ meta: translatableElement.meta })
      .from(translatableElement)
      .where(eq(translatableElement.id, query.elementId))
      .limit(1),
  );

  return row?.meta ?? null;
};

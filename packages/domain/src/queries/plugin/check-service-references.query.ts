import {
  account,
  blob,
  chunk,
  count,
  document,
  eq,
  mfaProvider,
  qaResultItem,
  translatableElementContext,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const CheckServiceReferencesQuerySchema = z.object({
  serviceDbId: z.int(),
});

export type CheckServiceReferencesQuery = z.infer<
  typeof CheckServiceReferencesQuerySchema
>;

export const checkServiceReferences: Query<
  CheckServiceReferencesQuery,
  boolean
> = async (ctx, query) => {
  const refChecks = [
    { table: account, column: account.authProviderId },
    { table: mfaProvider, column: mfaProvider.mfaServiceId },
    { table: blob, column: blob.storageProviderId },
    { table: chunk, column: chunk.vectorizerId },
    { table: document, column: document.fileHandlerId },
    {
      table: translatableElementContext,
      column: translatableElementContext.storageProviderId,
    },
    { table: qaResultItem, column: qaResultItem.checkerId },
  ] as const;

  for (const { table, column } of refChecks) {
    // oxlint-disable-next-line no-await-in-loop
    const refs = await ctx.db
      .select({ count: count() })
      .from(table)
      .where(eq(column, query.serviceDbId));
    if ((refs[0]?.count ?? 0) > 0) {
      return true;
    }
  }

  return false;
};

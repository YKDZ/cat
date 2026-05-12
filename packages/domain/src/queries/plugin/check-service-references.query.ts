import { blob, chunk, eq, mfaProvider } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const CheckServiceReferencesQuerySchema = z.object({
  serviceDbId: z.int(),
});

export type CheckServiceReferencesQuery = z.infer<
  typeof CheckServiceReferencesQuerySchema
>;

/**
 * @zh 检查插件服务是否被其他实体引用（mfaProvider / blob / chunk）。
 * @en Check if a plugin service is referenced by any entity (mfaProvider / blob / chunk).
 * @returns `true` if at least one reference exists (service must be kept), `false` if safe to delete.
 */
export const checkServiceReferences: Query<
  CheckServiceReferencesQuery,
  boolean
> = async (ctx, query) => {
  const mfaRows = await ctx.db
    .select({ id: mfaProvider.id })
    .from(mfaProvider)
    .where(eq(mfaProvider.mfaServiceId, query.serviceDbId))
    .limit(1);
  if (mfaRows.length > 0) return true;

  const blobRows = await ctx.db
    .select({ id: blob.id })
    .from(blob)
    .where(eq(blob.storageProviderId, query.serviceDbId))
    .limit(1);
  if (blobRows.length > 0) return true;

  const chunkRows = await ctx.db
    .select({ id: chunk.id })
    .from(chunk)
    .where(eq(chunk.vectorizerId, query.serviceDbId))
    .limit(1);
  return chunkRows.length > 0;
};

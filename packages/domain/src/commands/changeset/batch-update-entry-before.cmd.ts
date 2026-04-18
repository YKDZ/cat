import type { JSONType } from "@cat/shared/schema/json";

import { changesetEntry, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const BatchUpdateEntryBeforeCommandSchema = z.object({
  updates: z.array(
    z.object({
      entryId: z.int().positive(),
      before: z.unknown(),
    }),
  ),
});

export type BatchUpdateEntryBeforeCommand = z.infer<
  typeof BatchUpdateEntryBeforeCommandSchema
>;

/**
 * @zh 批量更新 changeset entry 的 before 字段。仅用于 rebase before-重写。
 * @en Batch-update the `before` field of changeset entries. Used exclusively for rebase before-rewrite.
 *
 * @note This uses N individual UPDATE queries via Promise.all. For large rebases this could be
 * slow. A single SQL CASE WHEN batching would be more optimal but is deferred as a future optimization.
 */
export const batchUpdateEntryBefore: Command<
  BatchUpdateEntryBeforeCommand
> = async (ctx, command) => {
  await Promise.all(
    command.updates.map(async (u) =>
      ctx.db
        .update(changesetEntry)
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        .set({ before: u.before as JSONType })
        .where(eq(changesetEntry.id, u.entryId)),
    ),
  );
  return { result: undefined, events: [] };
};

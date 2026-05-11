import { and, contentRelation, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const BulkUpdatePrimaryRelationOrderCommandSchema = z.object({
  primaryContentNodeId: z.uuidv4(),
  data: z.array(z.object({ elementId: z.int(), localOrder: z.int() })),
});
export type BulkUpdatePrimaryRelationOrderCommand = z.infer<
  typeof BulkUpdatePrimaryRelationOrderCommandSchema
>;

export const bulkUpdatePrimaryRelationOrder: Command<
  BulkUpdatePrimaryRelationOrderCommand
> = async (ctx, command) => {
  await Promise.all(
    command.data.map((item) =>
      ctx.db
        .update(contentRelation)
        .set({ localOrder: item.localOrder })
        .where(
          and(
            eq(contentRelation.sourceNodeId, command.primaryContentNodeId),
            eq(contentRelation.targetElementId, item.elementId),
            eq(contentRelation.isPrimary, true),
          ),
        ),
    ),
  );

  return { result: undefined, events: [] };
};

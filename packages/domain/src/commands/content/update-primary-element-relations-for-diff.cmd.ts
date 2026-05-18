import { and, contentRelation, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const UpdatePrimaryElementRelationsForDiffCommandSchema = z.object({
  updates: z.array(
    z.object({
      elementId: z.int(),
      primaryContentNodeId: z.uuidv4(),
      localOrder: z.int().nullable(),
    }),
  ),
});

export type UpdatePrimaryElementRelationsForDiffCommand = z.infer<
  typeof UpdatePrimaryElementRelationsForDiffCommandSchema
>;

/**
 * @zh 为稳定身份差分更新元素的主包含关系。
 * @en Update primary containment relations for stable-identity diffs.
 */
export const updatePrimaryElementRelationsForDiff: Command<
  UpdatePrimaryElementRelationsForDiffCommand
> = async (ctx, command) => {
  await Promise.all(
    command.updates.map((update) =>
      ctx.db
        .update(contentRelation)
        .set({
          sourceNodeId: update.primaryContentNodeId,
          localOrder: update.localOrder,
        })
        .where(
          and(
            eq(contentRelation.targetEndpointKind, "ELEMENT"),
            eq(contentRelation.targetElementId, update.elementId),
            eq(contentRelation.isPrimary, true),
          ),
        ),
    ),
  );

  return { result: undefined, events: [] };
};

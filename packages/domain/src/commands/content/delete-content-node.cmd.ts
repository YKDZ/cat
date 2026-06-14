import { contentNode, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const DeleteContentNodeCommandSchema = z.object({
  contentNodeId: z.uuidv4(),
});
export type DeleteContentNodeCommand = z.infer<
  typeof DeleteContentNodeCommandSchema
>;

/**
 * Delete a content node (cascading to its relations and children).
 */
export const deleteContentNode: Command<DeleteContentNodeCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .delete(contentNode)
    .where(eq(contentNode.id, command.contentNodeId));

  return { result: undefined, events: [] };
};

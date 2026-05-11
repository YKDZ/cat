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
 * @zh 删除内容节点（级联删除其关联关系和子节点）。
 * @en Delete a content node (cascading to its relations and children).
 */
export const deleteContentNode: Command<
  DeleteContentNodeCommand,
  void
> = async (ctx, command) => {
  await ctx.db
    .delete(contentNode)
    .where(eq(contentNode.id, command.contentNodeId));

  return { result: undefined, events: [] };
};

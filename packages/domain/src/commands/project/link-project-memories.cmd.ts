import { memoryToProject } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const LinkProjectMemoriesCommandSchema = z.object({
  projectId: z.uuidv4(),
  memoryIds: z.array(z.uuidv4()),
});

export type LinkProjectMemoriesCommand = z.infer<
  typeof LinkProjectMemoriesCommandSchema
>;

export const linkProjectMemories: Command<LinkProjectMemoriesCommand> = async (
  ctx,
  command,
) => {
  if (command.memoryIds.length > 0) {
    await ctx.db.insert(memoryToProject).values(
      command.memoryIds.map((memoryId) => ({
        projectId: command.projectId,
        memoryId,
      })),
    );
  }

  return {
    result: undefined,
    events: [],
  };
};

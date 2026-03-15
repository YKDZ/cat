import { and, eq, inArray, memoryToProject } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UnlinkProjectMemoriesCommandSchema = z.object({
  projectId: z.uuidv4(),
  memoryIds: z.array(z.uuidv4()),
});

export type UnlinkProjectMemoriesCommand = z.infer<
  typeof UnlinkProjectMemoriesCommandSchema
>;

export const unlinkProjectMemories: Command<
  UnlinkProjectMemoriesCommand
> = async (ctx, command) => {
  if (command.memoryIds.length > 0) {
    await ctx.db
      .delete(memoryToProject)
      .where(
        and(
          eq(memoryToProject.projectId, command.projectId),
          inArray(memoryToProject.memoryId, command.memoryIds),
        ),
      );
  }

  return {
    result: undefined,
    events: [],
  };
};

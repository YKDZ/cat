import { and, eq, glossaryToProject, inArray } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UnlinkProjectGlossariesCommandSchema = z.object({
  projectId: z.uuidv4(),
  glossaryIds: z.array(z.uuidv4()),
});

export type UnlinkProjectGlossariesCommand = z.infer<
  typeof UnlinkProjectGlossariesCommandSchema
>;

export const unlinkProjectGlossaries: Command<
  UnlinkProjectGlossariesCommand
> = async (ctx, command) => {
  if (command.glossaryIds.length > 0) {
    await ctx.db
      .delete(glossaryToProject)
      .where(
        and(
          eq(glossaryToProject.projectId, command.projectId),
          inArray(glossaryToProject.glossaryId, command.glossaryIds),
        ),
      );
  }

  return {
    result: undefined,
    events: [],
  };
};

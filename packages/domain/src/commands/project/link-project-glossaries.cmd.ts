import { glossaryToProject } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const LinkProjectGlossariesCommandSchema = z.object({
  projectId: z.uuidv4(),
  glossaryIds: z.array(z.uuidv4()),
});

export type LinkProjectGlossariesCommand = z.infer<
  typeof LinkProjectGlossariesCommandSchema
>;

export const linkProjectGlossaries: Command<
  LinkProjectGlossariesCommand
> = async (ctx, command) => {
  if (command.glossaryIds.length > 0) {
    await ctx.db.insert(glossaryToProject).values(
      command.glossaryIds.map((glossaryId) => ({
        projectId: command.projectId,
        glossaryId,
      })),
    );
  }

  return {
    result: undefined,
    events: [],
  };
};

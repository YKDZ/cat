import { and, eq, glossaryToProject } from "@cat/db";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const AssertProjectGlossaryBindingCommandSchema = z.strictObject({
  glossaryId: z.uuidv4(),
  projectId: z.uuidv4(),
});

export const assertProjectGlossaryBinding: Command<
  z.infer<typeof AssertProjectGlossaryBindingCommandSchema>,
  void
> = async (ctx, input) => {
  const command = AssertProjectGlossaryBindingCommandSchema.parse(input);
  const [binding] = await ctx.db
    .select({ glossaryId: glossaryToProject.glossaryId })
    .from(glossaryToProject)
    .where(
      and(
        eq(glossaryToProject.glossaryId, command.glossaryId),
        eq(glossaryToProject.projectId, command.projectId),
      ),
    )
    .limit(1)
    .for("key share");
  if (!binding)
    throw new TypeError("Glossary is not linked to the requested project.");
  return { result: undefined, events: [] };
};

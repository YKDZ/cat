import { and, eq, glossaryToProject } from "@cat/db";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const AssertProjectGlossaryBindingCommandSchema = z.strictObject({
  glossaryId: z.uuidv4(),
  projectId: z.uuidv4(),
});

export class GlossaryProjectBindingError extends Error {
  public constructor(glossaryId: string, projectId: string) {
    super(`Glossary ${glossaryId} is not linked to project ${projectId}.`);
    this.name = "GlossaryProjectBindingError";
  }
}

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
  if (!binding) {
    throw new GlossaryProjectBindingError(
      command.glossaryId,
      command.projectId,
    );
  }
  return { result: undefined, events: [] };
};

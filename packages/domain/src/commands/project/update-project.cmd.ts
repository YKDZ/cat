import { eq, project } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import { domainEvent } from "#/events/domain-events.ts";
import type { Command } from "#/types.ts";

export const UpdateProjectCommandSchema = z.object({
  projectId: z.uuidv4(),
  name: z.string().min(1).optional(),
  description: z.string().min(0).optional(),
});

export type UpdateProjectCommand = z.infer<typeof UpdateProjectCommandSchema>;

export const updateProject: Command<
  UpdateProjectCommand,
  typeof project.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(project)
      .set({
        name: command.name,
        description: command.description,
      })
      .where(eq(project.id, command.projectId))
      .returning(),
  );

  return {
    result: updated,
    events: [domainEvent("project:updated", { projectId: command.projectId })],
  };
};

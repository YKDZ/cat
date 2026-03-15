import { eq, project } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

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

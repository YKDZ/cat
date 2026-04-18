import { eq, project } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const DeleteProjectCommandSchema = z.object({
  projectId: z.uuidv4(),
});

export type DeleteProjectCommand = z.infer<typeof DeleteProjectCommandSchema>;

export const deleteProject: Command<DeleteProjectCommand> = async (
  ctx,
  command,
) => {
  await ctx.db.delete(project).where(eq(project.id, command.projectId));

  return {
    result: undefined,
    events: [domainEvent("project:deleted", { projectId: command.projectId })],
  };
};

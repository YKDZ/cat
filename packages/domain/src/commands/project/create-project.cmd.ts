import { project } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateProjectCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  creatorId: z.uuidv4(),
});

export type CreateProjectCommand = z.infer<typeof CreateProjectCommandSchema>;

export const createProject: Command<
  CreateProjectCommand,
  typeof project.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(project)
      .values({
        name: command.name,
        description: command.description,
        creatorId: command.creatorId,
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [
      domainEvent("project:created", {
        projectId: inserted.id,
        creatorId: command.creatorId,
      }),
    ],
  };
};

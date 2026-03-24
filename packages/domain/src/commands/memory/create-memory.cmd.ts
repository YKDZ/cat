import { memory, memoryToProject } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateMemoryCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  creatorId: z.uuidv4(),
  projectIds: z.array(z.uuidv4()).optional(),
});

export type CreateMemoryCommand = z.infer<typeof CreateMemoryCommandSchema>;

export const createMemory: Command<
  CreateMemoryCommand,
  typeof memory.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(memory)
      .values({
        name: command.name,
        description: command.description,
        creatorId: command.creatorId,
      })
      .returning(),
  );

  if ((command.projectIds?.length ?? 0) > 0) {
    await ctx.db.insert(memoryToProject).values(
      command.projectIds!.map((projectId) => ({
        memoryId: inserted.id,
        projectId,
      })),
    );
  }

  return {
    result: inserted,
    events: [
      domainEvent("memory:created", {
        memoryId: inserted.id,
        creatorId: command.creatorId,
      }),
    ],
  };
};

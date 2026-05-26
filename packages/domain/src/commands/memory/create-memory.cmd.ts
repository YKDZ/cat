import { memory, memoryToProject } from "@cat/db";
import {
  assertSingleNonNullish,
  MemoryScopeValues,
  type MemoryScope,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateMemoryCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  creatorId: z.uuidv4(),
  scope: z.enum(MemoryScopeValues).default("PROJECT"),
  projectIds: z.array(z.uuidv4()).optional(),
});

export type CreateMemoryCommand = z.input<typeof CreateMemoryCommandSchema>;

export const createMemory: Command<
  CreateMemoryCommand,
  typeof memory.$inferSelect
> = async (ctx, command) => {
  const scope: MemoryScope = command.scope ?? "PROJECT";
  const projectIds = command.projectIds ?? [];

  if (scope === "PERSONAL" && projectIds.length > 0) {
    throw new Error("personal memory cannot be linked to projects");
  }

  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(memory)
      .values({
        name: command.name,
        description: command.description,
        scope,
        creatorId: command.creatorId,
      })
      .returning(),
  );

  if (scope === "PROJECT" && projectIds.length > 0) {
    await ctx.db.insert(memoryToProject).values(
      projectIds.map((projectId) => ({
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

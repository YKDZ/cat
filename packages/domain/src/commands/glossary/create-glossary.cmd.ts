import { glossary, glossaryToProject } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateGlossaryCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  creatorId: z.uuidv4(),
  projectIds: z.array(z.uuidv4()).optional(),
});

export type CreateGlossaryCommand = z.infer<typeof CreateGlossaryCommandSchema>;

export const createGlossary: Command<
  CreateGlossaryCommand,
  typeof glossary.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(glossary)
      .values({
        name: command.name,
        description: command.description,
        creatorId: command.creatorId,
      })
      .returning(),
  );

  if ((command.projectIds?.length ?? 0) > 0) {
    await ctx.db.insert(glossaryToProject).values(
      command.projectIds!.map((projectId) => ({
        glossaryId: inserted.id,
        projectId,
      })),
    );
  }

  return {
    result: inserted,
    events: [
      domainEvent("glossary:created", {
        glossaryId: inserted.id,
        creatorId: command.creatorId,
      }),
    ],
  };
};

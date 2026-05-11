import { contentNode } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateRootContentNodeCommandSchema = z.object({
  projectId: z.uuidv4(),
  creatorId: z.uuidv4(),
});
export type CreateRootContentNodeCommand = z.infer<
  typeof CreateRootContentNodeCommandSchema
>;

export const createRootContentNode: Command<
  CreateRootContentNodeCommand,
  typeof contentNode.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(contentNode)
      .values({
        projectId: command.projectId,
        creatorId: command.creatorId,
        kind: "PROJECT_ROOT",
        displayLabel: "<root>",
        importerId: "core",
        sourceRootRef: `project:${command.projectId}`,
        stableSourceNodeRef: "<root>",
        exportRole: "PROJECT_ROOT",
        boundaryType: "PROJECT",
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [
      domainEvent("content-node:created", {
        projectId: command.projectId,
        contentNodeId: inserted.id,
      }),
    ],
  };
};

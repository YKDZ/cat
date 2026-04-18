import { document, documentClosure } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateRootDocumentCommandSchema = z.object({
  projectId: z.uuidv4(),
  creatorId: z.uuidv4(),
  name: z.string().default("<root>"),
});

export type CreateRootDocumentCommand = z.infer<
  typeof CreateRootDocumentCommandSchema
>;

export const createRootDocument: Command<
  CreateRootDocumentCommand,
  typeof document.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(document)
      .values({
        name: command.name,
        projectId: command.projectId,
        creatorId: command.creatorId,
        isDirectory: true,
      })
      .returning(),
  );

  await ctx.db.insert(documentClosure).values({
    ancestor: inserted.id,
    descendant: inserted.id,
    depth: 0,
    projectId: command.projectId,
  });

  return {
    result: inserted,
    events: [
      domainEvent("document:created", {
        projectId: command.projectId,
        documentId: inserted.id,
      }),
    ],
  };
};

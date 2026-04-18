import { document, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const DeleteDocumentCommandSchema = z.object({
  documentId: z.uuidv4(),
});

export type DeleteDocumentCommand = z.infer<typeof DeleteDocumentCommandSchema>;

export const deleteDocument: Command<DeleteDocumentCommand> = async (
  ctx,
  command,
) => {
  await ctx.db.delete(document).where(eq(document.id, command.documentId));

  return {
    result: undefined,
    events: [
      domainEvent("document:deleted", { documentId: command.documentId }),
    ],
  };
};

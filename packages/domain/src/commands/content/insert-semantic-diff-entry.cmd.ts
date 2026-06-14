import { semanticDiffEntry } from "@cat/db";
import {
  SemanticDiffEntryPayloadSchema,
  type SemanticDiffEntryPayload,
} from "@cat/shared";

import type { Command } from "@/types";

export type InsertSemanticDiffEntryInput = {
  projectId: string;
  entry: SemanticDiffEntryPayload & {
    elementId?: number | null;
    contentNodeId?: string | null;
    contentRelationId?: string | null;
  };
};

export type InsertSemanticDiffEntryOutput = {
  id: number;
};

/**
 * Insert a single semantic diff entry record.
 */
export const insertSemanticDiffEntry: Command<
  InsertSemanticDiffEntryInput,
  InsertSemanticDiffEntryOutput
> = async (ctx, command) => {
  const { projectId, entry } = command;
  const rows = await ctx.db
    .insert(semanticDiffEntry)
    .values({
      projectId,
      diffKind: entry.diffKind,
      elementId: entry.elementId ?? null,
      contentNodeId: entry.contentNodeId ?? null,
      contentRelationId: entry.contentRelationId ?? null,
      vectorInvalidationReason: entry.vectorInvalidationReason,
      payload: SemanticDiffEntryPayloadSchema.parse(entry),
    })
    .returning({ id: semanticDiffEntry.id });

  const row = rows[0];
  if (!row) throw new Error("Failed to insert semantic diff entry");

  return {
    result: { id: row.id },
    events: [],
  };
};

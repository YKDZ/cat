import type { JSONType } from "@cat/shared/schema/json";

import { translatableElement } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateElementsCommandSchema = z.object({
  data: z.array(
    z.object({
      meta: z.json().optional(),
      creatorId: z.uuidv4().optional(),
      documentId: z.uuidv4(),
      stringId: z.int(),
      sortIndex: z.int().optional(),
      sourceStartLine: z.int().nullable().optional(),
      sourceEndLine: z.int().nullable().optional(),
      sourceLocationMeta: z.json().nullable().optional(),
    }),
  ),
});

export type CreateElementsCommand = z.infer<typeof CreateElementsCommandSchema>;

export const createElements: Command<CreateElementsCommand, number[]> = async (
  ctx,
  command,
) => {
  if (command.data.length === 0) {
    return {
      result: [],
      events: [],
    };
  }

  const inserted = await ctx.db
    .insert(translatableElement)
    .values(
      command.data.map((item) => ({
        meta: (item.meta ?? {}) as JSONType,
        sortIndex: item.sortIndex ?? 0,
        creatorId: item.creatorId,
        documentId: item.documentId,
        vectorizedStringId: item.stringId,
        sourceStartLine: item.sourceStartLine ?? null,
        sourceEndLine: item.sourceEndLine ?? null,
        sourceLocationMeta: item.sourceLocationMeta ?? null,
      })),
    )
    .returning({ id: translatableElement.id });

  return {
    result: inserted.map((item) => item.id),
    events: [],
  };
};

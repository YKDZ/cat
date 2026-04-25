import type { JSONType } from "@cat/shared";

import { document, translatableElement, inArray } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

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
    .returning({
      id: translatableElement.id,
      documentId: translatableElement.documentId,
    });

  const byDocument = new Map<string, number[]>();
  for (const row of inserted) {
    const ids = byDocument.get(row.documentId) ?? [];
    ids.push(row.id);
    byDocument.set(row.documentId, ids);
  }

  const documentIds = [...byDocument.keys()];
  const documentRows = await ctx.db
    .select({ id: document.id, projectId: document.projectId })
    .from(document)
    .where(inArray(document.id, documentIds));

  const projectIdByDocument = new Map(
    documentRows.map((d) => [d.id, d.projectId]),
  );

  const events = [...byDocument.entries()].flatMap(
    ([documentId, elementIds]) => {
      const projectId = projectIdByDocument.get(documentId);
      if (!projectId) return [];
      return [
        domainEvent("element:created", { projectId, documentId, elementIds }),
      ];
    },
  );

  return {
    result: inserted.map((item) => item.id),
    events,
  };
};

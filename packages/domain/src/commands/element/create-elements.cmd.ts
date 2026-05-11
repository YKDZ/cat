import type { JSONType } from "@cat/shared";

import {
  and,
  contentRelation,
  contentRelationType,
  eq,
  translatableElement,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateElementsCommandSchema = z.object({
  data: z.array(
    z.object({
      projectId: z.uuidv4(),
      primaryContentNodeId: z.uuidv4(),
      importerId: z.string().min(1),
      sourceRootRef: z.string().min(1),
      sourceNodeRef: z.string().min(1),
      stableSourceRef: z.string().min(1),
      meta: z.json().optional(),
      creatorId: z.uuidv4().optional(),
      stringId: z.int(),
      localOrder: z.int().optional(),
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
  if (command.data.length === 0) return { result: [], events: [] };

  const containsType = assertSingleNonNullish(
    await ctx.db
      .select({ id: contentRelationType.id })
      .from(contentRelationType)
      .where(
        and(
          eq(contentRelationType.namespace, "core"),
          eq(contentRelationType.name, "contains"),
          eq(contentRelationType.version, "1.0.0"),
        ),
      )
      .limit(1),
  );

  const inserted = await ctx.db
    .insert(translatableElement)
    .values(
      command.data.map((item) => ({
        projectId: item.projectId,
        importerId: item.importerId,
        sourceRootRef: item.sourceRootRef,
        sourceNodeRef: item.sourceNodeRef,
        stableSourceRef: item.stableSourceRef,
        meta: (item.meta ?? {}) as JSONType,
        creatorId: item.creatorId,
        vectorizedStringId: item.stringId,
        sourceStartLine: item.sourceStartLine ?? null,
        sourceEndLine: item.sourceEndLine ?? null,
        sourceLocationMeta: item.sourceLocationMeta ?? null,
      })),
    )
    .returning({
      id: translatableElement.id,
      projectId: translatableElement.projectId,
    });

  await ctx.db.insert(contentRelation).values(
    inserted.map((row, index) => {
      const item = command.data[index];
      if (!item) throw new Error("Inserted element count mismatch");
      return {
        projectId: item.projectId,
        relationTypeId: containsType.id,
        sourceEndpointKind: "NODE" as const,
        sourceNodeId: item.primaryContentNodeId,
        targetEndpointKind: "ELEMENT" as const,
        targetElementId: row.id,
        isPrimary: true,
        localOrder: item.localOrder ?? index,
      };
    }),
  );

  const byNode = new Map<string, { projectId: string; elementIds: number[] }>();
  for (let index = 0; index < inserted.length; index += 1) {
    const row = inserted[index];
    const item = command.data[index];
    if (!row || !item) continue;
    const existing = byNode.get(item.primaryContentNodeId) ?? {
      projectId: row.projectId,
      elementIds: [],
    };
    existing.elementIds.push(row.id);
    byNode.set(item.primaryContentNodeId, existing);
  }

  return {
    result: inserted.map((item) => item.id),
    events: [...byNode.entries()].map(([contentNodeId, value]) =>
      domainEvent("element:created", {
        projectId: value.projectId,
        primaryContentNodeId: contentNodeId,
        elementIds: value.elementIds,
      }),
    ),
  };
};

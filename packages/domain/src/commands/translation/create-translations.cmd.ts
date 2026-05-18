import {
  and,
  contentRelation,
  eq,
  inArray,
  translatableElement,
  translation,
} from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateTranslationsCommandSchema = z.object({
  data: z.array(
    z.object({
      translatableElementId: z.int(),
      translatorId: z.uuidv4().nullable().optional(),
      stringId: z.int(),
      meta: z.json().optional(),
    }),
  ),
});

export type CreateTranslationsCommand = z.infer<
  typeof CreateTranslationsCommandSchema
>;

export const createTranslations: Command<
  CreateTranslationsCommand,
  number[]
> = async (ctx, command) => {
  if (command.data.length === 0) {
    return {
      result: [],
      events: [],
    };
  }

  const inserted = await ctx.db
    .insert(translation)
    .values(command.data)
    .returning({ id: translation.id });

  const translationIds = inserted.map((item) => item.id);
  const contextRows = await ctx.db
    .select({
      translationId: translation.id,
      elementId: translatableElement.id,
      projectId: translatableElement.projectId,
      primaryContentNodeId: contentRelation.sourceNodeId,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translatableElement.id, translation.translatableElementId),
    )
    .leftJoin(
      contentRelation,
      and(
        eq(contentRelation.targetElementId, translatableElement.id),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.sourceEndpointKind, "NODE"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .where(inArray(translation.id, translationIds));

  const byProject = new Map<
    string,
    {
      translationIds: Set<number>;
      elementIds: Set<number>;
      primaryContentNodeIds: Set<string>;
    }
  >();

  for (const row of contextRows) {
    const bucket = byProject.get(row.projectId) ?? {
      translationIds: new Set<number>(),
      elementIds: new Set<number>(),
      primaryContentNodeIds: new Set<string>(),
    };

    bucket.translationIds.add(row.translationId);
    bucket.elementIds.add(row.elementId);
    if (row.primaryContentNodeId !== null) {
      bucket.primaryContentNodeIds.add(row.primaryContentNodeId);
    }
    byProject.set(row.projectId, bucket);
  }

  const events = [...byProject.entries()].map(([projectId, value]) =>
    domainEvent("translation:created", {
      projectId,
      translationIds: [...value.translationIds],
      elementIds: [...value.elementIds],
      primaryContentNodeIds: [...value.primaryContentNodeIds],
    }),
  );

  return {
    result: translationIds,
    events,
  };
};

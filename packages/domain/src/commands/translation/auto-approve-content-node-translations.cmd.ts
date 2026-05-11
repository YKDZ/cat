import {
  contentRelation,
  eq,
  sql,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const AutoApproveContentNodeTranslationsCommandSchema = z.object({
  contentNodeId: z.uuidv4(),
  languageId: z.string(),
});

export type AutoApproveContentNodeTranslationsCommand = z.infer<
  typeof AutoApproveContentNodeTranslationsCommandSchema
>;

/**
 * @zh 自动批准指定内容节点下所有元素在目标语言中的最新翻译。
 * @en Auto-approve the latest translation for each element under a content node in the target language.
 * @returns Number of elements approved.
 */
export const autoApproveContentNodeTranslations: Command<
  AutoApproveContentNodeTranslationsCommand,
  number
> = async (ctx, command) => {
  // 1. Get all element IDs that are targets of the content node
  const elementRelations = await ctx.db
    .select({ elementId: contentRelation.targetElementId })
    .from(contentRelation)
    .where(
      sql`${contentRelation.sourceNodeId} = ${command.contentNodeId}
        AND ${contentRelation.targetEndpointKind} = 'ELEMENT'
        AND ${contentRelation.lifecycleStatus} = 'ACTIVE'`,
    );

  const elementIds = elementRelations
    .map((r) => r.elementId)
    .filter((id): id is number => id !== null);

  if (elementIds.length === 0) {
    return { result: 0, events: [] };
  }

  // 2. Find translations for each element in the target language
  const translations = await ctx.db
    .select({
      translationId: translation.id,
      elementId: translation.translatableElementId,
    })
    .from(translation)
    .innerJoin(vectorizedString, eq(translation.stringId, vectorizedString.id))
    .where(
      sql`${translation.translatableElementId} = ANY(${sql.raw(`ARRAY[${elementIds.join(",")}]::int[]`)})
        AND ${vectorizedString.languageId} = ${command.languageId}`,
    );

  if (translations.length === 0) {
    return { result: 0, events: [] };
  }

  // 3. For each element, pick the first translation found
  const byElement = new Map<number, number>();
  for (const row of translations) {
    if (!byElement.has(row.elementId)) {
      byElement.set(row.elementId, row.translationId);
    }
  }

  // 4. Update approvedTranslationId for each element
  const approvedTranslationIds: number[] = [];
  for (const [elementId, translationId] of byElement) {
    await ctx.db
      .update(translatableElement)
      .set({ approvedTranslationId: translationId })
      .where(
        sql`${translatableElement.id} = ${elementId}
          AND (${translatableElement.approvedTranslationId} IS NULL
            OR ${translatableElement.approvedTranslationId} <> ${translationId})`,
      );
    approvedTranslationIds.push(translationId);
  }

  return {
    result: approvedTranslationIds.length,
    events:
      approvedTranslationIds.length > 0
        ? [
            domainEvent("translation:updated", {
              translationIds: approvedTranslationIds,
            }),
          ]
        : [],
  };
};

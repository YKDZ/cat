import {
  and,
  desc,
  eq,
  inArray,
  sql,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const AutoApproveOperationScopeTranslationsCommandSchema = z.object({
  elementIds: z.array(z.int()),
  languageId: z.string(),
});

export type AutoApproveOperationScopeTranslationsCommand = z.infer<
  typeof AutoApproveOperationScopeTranslationsCommandSchema
>;

export type AutoApproveOperationScopeTranslationsResult = {
  count: number;
  approvedTranslationIds: number[];
};

/**
 * @zh 自动批准指定元素集合在目标语言中的最新翻译。
 * @en Auto-approve the latest translation for the provided element set in the target language.
 * @returns Number of elements approved.
 */
export const autoApproveOperationScopeTranslations: Command<
  AutoApproveOperationScopeTranslationsCommand,
  AutoApproveOperationScopeTranslationsResult
> = async (ctx, command) => {
  if (command.elementIds.length === 0) {
    return { result: { count: 0, approvedTranslationIds: [] }, events: [] };
  }

  const translations = await ctx.db
    .select({
      translationId: translation.id,
      elementId: translation.translatableElementId,
    })
    .from(translation)
    .innerJoin(vectorizedString, eq(translation.stringId, vectorizedString.id))
    .where(
      and(
        inArray(translation.translatableElementId, command.elementIds),
        eq(vectorizedString.languageId, command.languageId),
      ),
    )
    .orderBy(desc(translation.id));

  const byElement = new Map<number, number>();
  for (const row of translations) {
    if (row.elementId === null) continue;
    if (byElement.has(row.elementId)) continue;

    byElement.set(row.elementId, row.translationId);
  }

  if (byElement.size === 0) {
    return { result: { count: 0, approvedTranslationIds: [] }, events: [] };
  }

  const approvedTranslationIds: number[] = [];
  await Promise.all(
    Array.from(byElement).map(async ([elementId, translationId]) => {
      const updated = await ctx.db
        .update(translatableElement)
        .set({ approvedTranslationId: translationId })
        .where(
          sql`${translatableElement.id} = ${elementId}
            AND (${translatableElement.approvedTranslationId} IS NULL
              OR ${translatableElement.approvedTranslationId} <> ${translationId})`,
        )
        .returning({
          approvedTranslationId: translatableElement.approvedTranslationId,
        });

      if (updated.length > 0) {
        approvedTranslationIds.push(translationId);
      }
    }),
  );

  return {
    result: {
      count: approvedTranslationIds.length,
      approvedTranslationIds,
    },
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

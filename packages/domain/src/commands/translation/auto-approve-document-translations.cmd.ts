import {
  desc,
  eq,
  isNull,
  sql,
  translation,
  translationVote,
  translatableElement,
  translatableString,
  and,
} from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const AutoApproveDocumentTranslationsCommandSchema = z.object({
  documentId: z.uuidv4(),
  languageId: z.string(),
});

export type AutoApproveDocumentTranslationsCommand = z.infer<
  typeof AutoApproveDocumentTranslationsCommandSchema
>;

export const autoApproveDocumentTranslations: Command<
  AutoApproveDocumentTranslationsCommand,
  number
> = async (ctx, command) => {
  const voteSum =
    sql<number>`COALESCE(SUM(${translationVote.value}), 0)`.mapWith(Number);

  const bestTranslations = await ctx.db
    .selectDistinctOn([translation.translatableElementId], {
      elementId: translation.translatableElementId,
      translationId: translation.id,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .innerJoin(
      translatableString,
      eq(translation.stringId, translatableString.id),
    )
    .leftJoin(
      translationVote,
      eq(translationVote.translationId, translation.id),
    )
    .where(
      and(
        eq(translatableElement.documentId, command.documentId),
        eq(translatableString.languageId, command.languageId),
        isNull(translatableElement.approvedTranslationId),
      ),
    )
    .groupBy(
      translation.id,
      translation.translatableElementId,
      translation.createdAt,
    )
    .orderBy(
      translation.translatableElementId,
      desc(voteSum),
      desc(translation.createdAt),
    );

  if (bestTranslations.length === 0) {
    return {
      result: 0,
      events: [],
    };
  }

  await Promise.all(
    bestTranslations.map((item) =>
      ctx.db
        .update(translatableElement)
        .set({ approvedTranslationId: item.translationId })
        .where(eq(translatableElement.id, item.elementId)),
    ),
  );

  return {
    result: bestTranslations.length,
    events: [
      domainEvent("translation:updated", {
        translationIds: bestTranslations.map((item) => item.translationId),
      }),
    ],
  };
};

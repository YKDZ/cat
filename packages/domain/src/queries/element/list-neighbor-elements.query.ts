import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  lt,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListNeighborElementsQuerySchema = z.object({
  /** The reference element whose neighbors we want. */
  elementId: z.int(),
  /** Number of elements to fetch on each side (before and after). */
  windowSize: z.int().min(1).default(3),
});

export type ListNeighborElementsQuery = z.infer<
  typeof ListNeighborElementsQuerySchema
>;

export type NeighborElement = {
  id: number;
  value: string;
  languageId: string;
  approvedTranslation: string | null;
  approvedTranslationLanguageId: string | null;
  /** Position relative to the reference element (negative = before, positive = after). */
  offset: number;
};

type NeighborRow = Omit<NeighborElement, "offset">;

/**
 * Fetch the nearest sibling elements within the same document.
 *
 * Prefer `sortIndex` ordering when available; fall back to `id` ordering when
 * the reference element has no sort index.
 */
export const listNeighborElements: Query<
  ListNeighborElementsQuery,
  NeighborElement[]
> = async (ctx, query) => {
  const refRows = await ctx.db
    .select({
      documentId: translatableElement.documentId,
      sortIndex: translatableElement.sortIndex,
    })
    .from(translatableElement)
    .where(eq(translatableElement.id, query.elementId))
    .limit(1);

  if (refRows.length === 0 || !refRows[0]) return [];

  const approvedTranslationString = aliasedTable(
    vectorizedString,
    "approvedTranslationString",
  );
  const ref = refRows[0];

  const buildNeighborQuery = async (
    direction: "before" | "after",
  ): Promise<NeighborRow[]> => {
    const positionCondition =
      ref.sortIndex !== null
        ? and(
            isNotNull(translatableElement.sortIndex),
            direction === "before"
              ? lt(translatableElement.sortIndex, ref.sortIndex)
              : gt(translatableElement.sortIndex, ref.sortIndex),
          )
        : direction === "before"
          ? lt(translatableElement.id, query.elementId)
          : gt(translatableElement.id, query.elementId);
    const orderBy =
      ref.sortIndex !== null
        ? direction === "before"
          ? desc(translatableElement.sortIndex)
          : asc(translatableElement.sortIndex)
        : direction === "before"
          ? desc(translatableElement.id)
          : asc(translatableElement.id);

    return await ctx.db
      .select({
        id: translatableElement.id,
        value: vectorizedString.value,
        languageId: vectorizedString.languageId,
        approvedTranslation: approvedTranslationString.value,
        approvedTranslationLanguageId: approvedTranslationString.languageId,
      })
      .from(translatableElement)
      .innerJoin(
        vectorizedString,
        eq(vectorizedString.id, translatableElement.vectorizedStringId),
      )
      .leftJoin(
        translation,
        eq(translation.id, translatableElement.approvedTranslationId),
      )
      .leftJoin(
        approvedTranslationString,
        eq(approvedTranslationString.id, translation.stringId),
      )
      .where(
        and(
          eq(translatableElement.documentId, ref.documentId),
          positionCondition,
        ),
      )
      .orderBy(orderBy)
      .limit(query.windowSize);
  };

  const [before, after] = await Promise.all([
    buildNeighborQuery("before"),
    buildNeighborQuery("after"),
  ]);

  return [
    ...before.reverse().map((element, index) => ({
      id: element.id,
      value: element.value,
      languageId: element.languageId,
      approvedTranslation: element.approvedTranslation,
      approvedTranslationLanguageId: element.approvedTranslationLanguageId,
      offset: -(before.length - index),
    })),
    ...after.map((element, index) => ({
      id: element.id,
      value: element.value,
      languageId: element.languageId,
      approvedTranslation: element.approvedTranslation,
      approvedTranslationLanguageId: element.approvedTranslationLanguageId,
      offset: index + 1,
    })),
  ];
};

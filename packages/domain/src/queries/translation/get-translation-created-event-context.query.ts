import {
  and,
  contentRelation,
  eq,
  inArray,
  translatableElement,
  translation,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetTranslationCreatedEventContextQuerySchema = z.object({
  translationIds: z.array(z.int()),
});
export type GetTranslationCreatedEventContextQuery = z.infer<
  typeof GetTranslationCreatedEventContextQuerySchema
>;

/**
 * @zh 翻译创建事件的上下文载荷。
 * @en Context payload for translation-created events.
 */
export type TranslationCreatedEventContext = {
  projectId: string;
  translationIds: number[];
  elementIds: number[];
  primaryContentNodeIds: string[];
};

/**
 * @zh 根据翻译 ID 解析项目、元素和主内容节点上下文。
 * @en Resolve project, element, and primary content-node context for translation ids.
 *
 * @param ctx - {@zh 查询上下文} {@en Query context}
 * @param query - {@zh 翻译 ID 查询参数} {@en Translation-id query input}
 * @returns - {@zh 按项目分组的翻译创建事件上下文} {@en Translation-created event context grouped by project}
 */
export const getTranslationCreatedEventContext: Query<
  GetTranslationCreatedEventContextQuery,
  TranslationCreatedEventContext[]
> = async (ctx, query) => {
  if (query.translationIds.length === 0) return [];

  const rows = await ctx.db
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
    .where(inArray(translation.id, query.translationIds));

  const byProject = new Map<
    string,
    {
      translationIds: Set<number>;
      elementIds: Set<number>;
      primaryContentNodeIds: Set<string>;
    }
  >();

  for (const row of rows) {
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

  return [...byProject.entries()].map(([projectId, value]) => ({
    projectId,
    translationIds: [...value.translationIds],
    elementIds: [...value.elementIds],
    primaryContentNodeIds: [...value.primaryContentNodeIds],
  }));
};

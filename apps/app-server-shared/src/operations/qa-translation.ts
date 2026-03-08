import {
  alias,
  document,
  eq,
  getDrizzleDB,
  glossaryToProject,
  project,
  qaResult,
  qaResultItem,
  translatableElement,
  translatableString,
  translation,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import z from "zod";

import type { OperationContext } from "@/operations/types";

import { lookupTermsForElementOp } from "@/operations/lookup-terms-for-element";
import { qaOp } from "@/operations/qa";
import { tokenizeOp } from "@/operations/tokenize";

export const QaTranslationInputSchema = z.object({
  translationId: z.int(),
});

export const QaTranslationOutputSchema = z.object({});

export type QaTranslationInput = z.infer<typeof QaTranslationInputSchema>;
export type QaTranslationOutput = z.infer<typeof QaTranslationOutputSchema>;

/**
 * 翻译质量检查
 *
 * 对指定翻译执行完整 QA 流程：
 * 1. 获取翻译文本、源文本及语言信息
 * 2. 查找相关术语（统一走后端）
 * 3. 并行对源文本和翻译文本进行分词（含术语标注）
 * 4. 创建 QA 结果记录
 * 5. 执行 QA 检查并持久化结果
 */
export const qaTranslationOp = async (
  payload: QaTranslationInput,
  ctx?: OperationContext,
): Promise<QaTranslationOutput> => {
  const { client: drizzle } = await getDrizzleDB();
  const traceId = ctx?.traceId ?? crypto.randomUUID();

  // 1. 获取翻译文本、源文本及语言信息
  const translationStringAlias = alias(translatableString, "translationString");
  const elementStringAlias = alias(translatableString, "elementString");

  const textData = assertSingleNonNullish(
    await drizzle
      .select({
        translationText: translationStringAlias.value,
        translationLanguageId: translationStringAlias.languageId,
        elementText: elementStringAlias.value,
        elementLanguageId: elementStringAlias.languageId,
        elementId: translatableElement.id,
      })
      .from(translation)
      .innerJoin(
        translationStringAlias,
        eq(translationStringAlias.id, translation.stringId),
      )
      .innerJoin(
        translatableElement,
        eq(translatableElement.id, translation.translatableElementId),
      )
      .innerJoin(
        elementStringAlias,
        eq(elementStringAlias.id, translatableElement.translatableStringId),
      )
      .where(eq(translation.id, payload.translationId)),
  );

  // 2. 查找相关术语（后端自动获取，统一走 lookupTermsForElementOp）
  const termData = await lookupTermsForElementOp(
    textData.elementId,
    textData.translationLanguageId,
  );

  // 3. 并行分词（含术语标注）
  const [translationResult, elementResult] = await Promise.all([
    tokenizeOp({ text: textData.translationText, terms: termData }, ctx),
    tokenizeOp({ text: textData.elementText, terms: termData }, ctx),
  ]);

  // 4. 获取完整数据和创建 QA 结果记录
  const { data, resultId, glossaryIds } = await drizzle.transaction(
    async (tx) => {
      const translationStringAlias2 = alias(
        translatableString,
        "translationString",
      );
      const elementStringAlias2 = alias(translatableString, "elementString");

      const data = assertSingleNonNullish(
        await tx
          .select({
            elementText: elementStringAlias2.value,
            elementLanguageId: elementStringAlias2.languageId,
            translationText: translationStringAlias2.value,
            translationLanguageId: translationStringAlias2.languageId,
            projectId: project.id,
          })
          .from(translation)
          .innerJoin(
            translationStringAlias2,
            eq(translationStringAlias2.id, translation.stringId),
          )
          .innerJoin(
            translatableElement,
            eq(translatableElement.id, translation.translatableElementId),
          )
          .innerJoin(
            elementStringAlias2,
            eq(
              elementStringAlias2.id,
              translatableElement.translatableStringId,
            ),
          )
          .innerJoin(document, eq(document.id, translatableElement.documentId))
          .innerJoin(project, eq(document.projectId, project.id))
          .where(eq(translation.id, payload.translationId)),
      );

      const { id: resultId } = assertSingleNonNullish(
        await tx
          .insert(qaResult)
          .values({
            translationId: payload.translationId,
          })
          .returning({
            id: qaResult.id,
          }),
      );

      const glossaryIds = (
        await tx
          .select({ id: glossaryToProject.glossaryId })
          .from(glossaryToProject)
          .where(eq(glossaryToProject.projectId, data.projectId))
      ).map((r) => r.id);

      return { data, resultId, glossaryIds };
    },
  );

  // 4. 执行 QA 检查（直接调用 qaOp，不需要 pub/sub 中转）
  const qaResult2 = await qaOp(
    {
      source: {
        text: data.elementText,
        tokens: elementResult.tokens,
        languageId: data.elementLanguageId,
      },
      translation: {
        text: data.translationText,
        tokens: translationResult.tokens,
        languageId: data.translationLanguageId,
      },
      glossaryIds,
      // 不需要 pub，因为我们直接获取结果
      pub: false,
    },
    { traceId },
  );

  // 5. 持久化 QA 结果
  if (qaResult2.result.length > 0) {
    await drizzle.insert(qaResultItem).values(
      qaResult2.result.map((item) => ({
        isPassed: item.isPassed,
        checkerId: item.checkerId,
        resultId,
        meta: item.meta,
      })),
    );
  }

  return {};
};

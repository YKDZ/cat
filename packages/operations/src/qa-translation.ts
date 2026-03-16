import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  createQaResultWithItems,
  executeCommand,
  executeQuery,
  getTranslationQaContext,
  listProjectGlossaryIds,
} from "@cat/domain";
import z from "zod";

import { qaOp } from "./qa";
import { tokenizeOp } from "./tokenize";

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
  const { client: drizzle } = await getDbHandle();
  const traceId = ctx?.traceId ?? crypto.randomUUID();

  const data = await executeQuery({ db: drizzle }, getTranslationQaContext, {
    translationId: payload.translationId,
  });

  if (!data) {
    throw new Error(`Translation ${payload.translationId} not found for QA`);
  }

  const glossaryIds = await executeQuery(
    { db: drizzle },
    listProjectGlossaryIds,
    { projectId: data.projectId },
  );

  // 3. 并行分词（含术语标注）
  const [translationResult, elementResult] = await Promise.all([
    tokenizeOp({ text: data.translationText }, ctx),
    tokenizeOp({ text: data.elementText }, ctx),
  ]);

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
    },
    { traceId },
  );

  // 5. 持久化 QA 结果
  await executeCommand({ db: drizzle }, createQaResultWithItems, {
    translationId: payload.translationId,
    items: qaResult2.result.map((item) => ({
      isPassed: item.isPassed,
      checkerId: item.checkerId,
      meta: item.meta,
    })),
  });

  return {};
};

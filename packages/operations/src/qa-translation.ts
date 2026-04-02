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
 * @zh 对指定翻译执行完整 QA 流程。
 *
 * 1. 获取翻译文本、源文本及语言信息
 * 2. 查找相关术语（统一走后端）
 * 3. 并行对源文本和翻译文本进行分词（含术语标注）
 * 4. 执行 QA 检查
 * 5. 持久化 QA 结果
 * @en Run the full QA pipeline for a specific translation.
 *
 * 1. Fetch the translation text, source text, and language information
 * 2. Look up relevant terms (via backend query chain)
 * 3. Tokenize source and translation texts in parallel (with term annotations)
 * 4. Run QA checks
 * 5. Persist QA results
 *
 * @param payload - {@zh QA 检查输入参数（翻译 ID）} {@en QA input parameters (translation ID)}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 空对象（结果已直接写入数据库）} {@en Empty object (results are persisted directly to the database)}
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

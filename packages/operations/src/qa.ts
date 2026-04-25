import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { executeQuery, listLexicalTermSuggestions } from "@cat/domain";
import {
  PluginManager,
  type QAChecker,
  TokenSchema,
  type CheckContext,
  type Token,
} from "@cat/plugin-core";
import { QaResultItemSchema, type QaResultItem } from "@cat/shared";
import z from "zod";

export const QAInputSchema = z.object({
  source: z.object({
    languageId: z.string(),
    text: z.string(),
    tokens: z.array(TokenSchema),
  }),
  translation: z.object({
    languageId: z.string(),
    text: z.string(),
    tokens: z.array(TokenSchema),
  }),
  glossaryIds: z.array(z.uuidv4()),
});

export const QAOutputSchema = z.object({
  result: z.array(
    QaResultItemSchema.omit({
      id: true,
      resultId: true,
      createdAt: true,
      updatedAt: true,
    }),
  ),
});

export type QAInput = z.infer<typeof QAInputSchema>;
export type QAOutput = z.infer<typeof QAOutputSchema>;

const flattenTokens = (tokens: Token[]): Token[] => {
  const result: Token[] = [];

  const traverse = (nodes: Token[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  };
  traverse(tokens);

  return result;
};

/**
 * @zh 质量检查。
 *
 * 使用所有已注册的 QA_CHECKER 插件对源文本/翻译文本进行质量检查。
 * @en Quality check.
 *
 * Runs all registered QA_CHECKER plugin services against the source
 * text and translation text.
 *
 * @param payload - {@zh QA 输入，包含源文本、翻译文本及词汇表 IDs} {@en QA input containing source text, translation text, and glossary IDs}
 * @param _ctx - {@zh 操作上下文（未使用）} {@en Operation context (unused)}
 * @returns - {@zh 每个检查器的检查结果列表} {@en List of check results from each QA checker}
 */
export const qaOp = async (
  payload: QAInput,
  _ctx?: OperationContext,
): Promise<QAOutput> => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const terms = await executeQuery(
    { db: drizzle },
    listLexicalTermSuggestions,
    {
      text: payload.source.text,
      sourceLanguageId: payload.source.languageId,
      translationLanguageId: payload.translation.languageId,
      glossaryIds: payload.glossaryIds,
      wordSimilarityThreshold: 0.3,
    },
  );

  const { source, translation } = payload;

  const checkCtx = {
    source: {
      ...source,
      flatTokens: flattenTokens(source.tokens),
    },
    translation: {
      ...translation,
      flatTokens: flattenTokens(translation.tokens),
    },
    terms,
  } satisfies CheckContext;

  const checkers: { service: QAChecker; dbId: number }[] =
    pluginManager.getServices("QA_CHECKER");

  const result: Omit<
    QaResultItem,
    "id" | "createdAt" | "updatedAt" | "resultId"
  >[] = (
    await Promise.all(
      checkers.map(async (checker) => {
        const issues = (await checker.service.check(checkCtx)).map((i) => ({
          isPassed: false,
          meta: {
            ...i,
          },
          checkerId: checker.dbId,
        }));

        if (issues.length > 0) return issues;

        return [
          {
            isPassed: true,
            checkerId: checker.dbId,
            meta: {},
          } satisfies Omit<
            QaResultItem,
            "id" | "createdAt" | "updatedAt" | "resultId"
          >,
        ];
      }),
    )
  ).flat();

  return { result };
};

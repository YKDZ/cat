import { getDrizzleDB, getRedisDB } from "@cat/db";
import { executeQuery, listLexicalTermSuggestions } from "@cat/domain";
import {
  PluginManager,
  type QAChecker,
  TokenSchema,
  type CheckContext,
  type Token,
} from "@cat/plugin-core";
import {
  QaResultItemSchema,
  type QaResultItem,
} from "@cat/shared/schema/drizzle/qa";
import z from "zod";

import type { OperationContext } from "@/operations/types";

export const getQAPubKey = (id: string): string => {
  return `qa:issue:${id}`;
};

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
  pub: z.boolean().default(false).optional(),
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

export const QAPubPayloadSchema = z.object({
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
export type QAPubPayload = z.infer<typeof QAPubPayloadSchema>;

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
 * 质量检查
 *
 * 使用所有已注册的 QA_CHECKER 插件对源文本/翻译文本进行质量检查。
 * 可选通过 Redis pub/sub 发布结果。
 */
export const qaOp = async (
  payload: QAInput,
  ctx?: OperationContext,
): Promise<QAOutput> => {
  const { client: drizzle } = await getDrizzleDB();
  const { redisPub } = await getRedisDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const traceId = ctx?.traceId ?? crypto.randomUUID();

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

  const { source, translation, pub } = payload;

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

  if (pub)
    await redisPub.publish(
      getQAPubKey(traceId),
      JSON.stringify({ result } satisfies QAPubPayload),
    );

  return { result };
};

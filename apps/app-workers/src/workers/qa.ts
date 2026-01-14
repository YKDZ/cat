import { defineWorkflow } from "@/core";
import { getRedisDB } from "@cat/db";
import {
  PluginManager,
  QAChecker,
  TokenSchema,
  type CheckContext,
  type Token,
} from "@cat/plugin-core";
import z from "zod";
import { searchTermTask } from "./search-term";
import {
  QaResultItemSchema,
  type QaResultItem,
} from "@cat/shared/schema/drizzle/qa";

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

export type QAPubPayload = z.infer<typeof QAPubPayloadSchema>;

export const qaWorkflow = await defineWorkflow({
  name: "qa",
  input: QAInputSchema,
  output: QAOutputSchema,

  dependencies: async (payload, { traceId }) => [
    await searchTermTask.asChild(
      {
        text: payload.source.text,
        sourceLanguageId: payload.source.languageId,
        translationLanguageId: payload.translation.languageId,
        glossaryIds: payload.glossaryIds,
      },
      { traceId },
    ),
  ],

  handler: async (payload, { traceId, getTaskResult }) => {
    const { redisPub } = await getRedisDB();
    const pluginManager = PluginManager.get("GLOBAL", "");

    const [termResult] = getTaskResult(searchTermTask);
    const terms = termResult?.terms ?? [];

    const { source, translation, pub } = payload;

    const ctx = {
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
          const issues = (await checker.service.check(ctx)).map((i) => ({
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
  },
});

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

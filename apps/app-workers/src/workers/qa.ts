import { defineWorkflow } from "@/core";
import { getRedisDB } from "@cat/db";
import {
  PluginManager,
  QAChecker,
  QAIssueSchema,
  TokenSchema,
  type CheckContext,
  type QAIssue,
  type Token,
} from "@cat/plugin-core";
import z from "zod";
import { searchTermTask } from "./search-term";

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
  issues: z.array(
    QAIssueSchema.extend({
      checkerId: z.int(),
    }),
  ),
});

export const QAPubPayloadSchema = z.object({
  issues: z.array(
    QAIssueSchema.extend({
      checkerId: z.int(),
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

    const issues: (QAIssue & { checkerId: number })[] = [];

    await Promise.all(
      checkers.map(async (checker) => {
        const issue = (await checker.service.check(ctx)).map((i) => ({
          ...i,
          checkerId: checker.dbId,
        }));

        issues.push(...issue);

        if (pub)
          await redisPub.publish(
            getQAPubKey(traceId),
            JSON.stringify({ issues } satisfies QAPubPayload),
          );
      }),
    );

    return { issues };
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

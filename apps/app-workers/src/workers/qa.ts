import { defineWorkflow } from "@/core";
import { getDrizzleDB, getRedisDB } from "@cat/db";
import {
  PluginRegistry,
  QAChecker,
  QAIssueSchema,
  TokenSchema,
  type CheckContext,
  type QAIssue,
  type Token,
} from "@cat/plugin-core";
import z from "zod";
import { searchTermTask } from "./search-term";

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
    const { client: drizzle } = await getDrizzleDB();
    const { redisPub } = await getRedisDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

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

    const checkers: { checker: QAChecker; id: number }[] = await Promise.all(
      pluginRegistry
        .getPluginServices("QA_CHECKER")
        .map(async ({ record, service }) => {
          const id = await pluginRegistry.getPluginServiceDbId(
            drizzle,
            record.pluginId,
            record.type,
            record.id,
          );
          return {
            checker: service,
            id,
          };
        }),
    );

    const issues: (QAIssue & { checkerId: number })[] = [];

    await Promise.all(
      checkers.map(async (checker) => {
        const issue = (await checker.checker.check(ctx)).map((i) => ({
          ...i,
          checkerId: checker.id,
        }));

        issues.push(...issue);

        if (pub)
          await redisPub.publish(`qa:issue:${traceId}`, JSON.stringify(issue));
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

import { listLexicalTermSuggestions } from "@cat/domain";
import {
  PluginManager,
  TokenSchema,
  type CheckContext,
  type QAChecker,
  type Token,
} from "@cat/plugin-core";
import {
  QaResultItemSchema,
  type QaResultItem,
} from "@cat/shared/schema/drizzle/qa";
import * as z from "zod/v4";

import { runAgentQuery } from "@/db/domain";
import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

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

export const QAResultItemPayloadSchema = QaResultItemSchema.omit({
  id: true,
  resultId: true,
  createdAt: true,
  updatedAt: true,
});

export const QAOutputSchema = z.object({
  result: z.array(QAResultItemPayloadSchema),
});

export const QAPubPayloadSchema = z.object({
  traceId: z.string(),
  result: z.array(QAResultItemPayloadSchema),
});

export type QAPubPayload = z.infer<typeof QAPubPayloadSchema>;

const flattenTokens = (tokens: Token[]): Token[] => {
  const result: Token[] = [];
  const traverse = (nodes: Token[]): void => {
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

export const qaGraph = defineTypedGraph({
  id: "qa",
  input: QAInputSchema,
  output: QAOutputSchema,
  nodes: {
    main: defineNode({
      input: QAInputSchema,
      output: QAOutputSchema,
      handler: async (payload, ctx) => {
        const pluginManager =
          ctx.pluginManager ?? PluginManager.get("GLOBAL", "");
        const terms = await runAgentQuery(listLexicalTermSuggestions, {
          text: payload.source.text,
          sourceLanguageId: payload.source.languageId,
          translationLanguageId: payload.translation.languageId,
          glossaryIds: payload.glossaryIds,
          wordSimilarityThreshold: 0.3,
        });

        const checkContext = {
          source: {
            ...payload.source,
            flatTokens: flattenTokens(payload.source.tokens),
          },
          translation: {
            ...payload.translation,
            flatTokens: flattenTokens(payload.translation.tokens),
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
              const issues = (await checker.service.check(checkContext)).map(
                (issue) => ({
                  isPassed: false,
                  meta: { ...issue },
                  checkerId: checker.dbId,
                }),
              );

              if (issues.length > 0) {
                return issues;
              }

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

        if (payload.pub) {
          for (const issue of result.filter((item) => !item.isPassed)) {
            ctx.addEvent({
              type: "workflow:qa:issue",
              payload: {
                traceId: ctx.traceId,
                result: [issue],
              } satisfies QAPubPayload,
            });
          }
        }

        return { result };
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

/** @deprecated use qaGraph */
export const qaWorkflow = qaGraph;

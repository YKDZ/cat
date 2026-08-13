import {
  createQaResultWithItems,
  executeCommand,
  executeQuery,
  getDbHandle,
  getTranslationQaContext,
  listProjectGlossaryIds,
} from "@cat/domain";
import * as z from "zod";

import { defineNode, defineGraph } from "#/graph/dsl/index.ts";
import { runGraph } from "#/graph/dsl/run-graph.ts";

import { qaGraph } from "./qa.ts";
import { tokenizeGraph } from "./tokenize.ts";

export const qaTranslationGraph = defineGraph({
  id: "qa-translation",
  input: z.object({
    translationId: z.int(),
  }),
  output: z.object({}),
  nodes: {
    main: defineNode({
      input: z.object({ translationId: z.int() }),
      output: z.object({}),
      handler: async (payload, ctx) => {
        const qaPhaseKey = `qa-translation:${payload.translationId}`;
        if (ctx.ownershipFence) {
          const existing = await ctx.checkSideEffect(qaPhaseKey);
          if (existing !== null) return {};
        }
        const { client: db } = await getDbHandle();
        const data = await executeQuery({ db }, getTranslationQaContext, {
          translationId: payload.translationId,
        });

        if (!data) {
          throw new Error(
            `Translation ${payload.translationId} not found for QA workflow`,
          );
        }

        const [translationResult, elementResult] = await Promise.all([
          runGraph(
            tokenizeGraph,
            { text: data.translationText },
            {
              signal: ctx.signal,
              pluginManager: ctx.pluginManager,
              ownershipFence: ctx.ownershipFence,
              assertRunOwnership: ctx.assertRunOwnership,
            },
          ),
          runGraph(
            tokenizeGraph,
            { text: data.elementText },
            {
              signal: ctx.signal,
              pluginManager: ctx.pluginManager,
              ownershipFence: ctx.ownershipFence,
              assertRunOwnership: ctx.assertRunOwnership,
            },
          ),
        ]);

        const glossaryIds = await executeQuery({ db }, listProjectGlossaryIds, {
          projectId: data.projectId,
        });

        const qa = await runGraph(
          qaGraph,
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
          {
            signal: ctx.signal,
            pluginManager: ctx.pluginManager,
            ownershipFence: ctx.ownershipFence,
            assertRunOwnership: ctx.assertRunOwnership,
          },
        );

        await executeCommand({ db }, createQaResultWithItems, {
          translationId: payload.translationId,
          items: qa.result.map((item) => ({
            isPassed: item.isPassed,
            checker: item.checker,
            meta: item.meta,
          })),
          ...(ctx.ownershipFence
            ? {
                ownershipFence: ctx.ownershipFence,
                workflowOutput: {
                  nodeId: ctx.nodeId,
                  outputKey: qaPhaseKey,
                  idempotencyKey: `${ctx.nodeId}:${ctx.ownershipFence.runId}:${qaPhaseKey}`,
                },
              }
            : {}),
        });

        return {};
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

import {
  createQaResult,
  createQaResultItems,
  executeCommand,
  executeQuery,
  getDbHandle,
  getTranslationQaContext,
  listProjectGlossaryIds,
} from "@cat/domain";
import * as z from "zod/v4";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";
import { runGraph } from "@/graph/typed-dsl/run-graph";

import { qaGraph } from "./qa";
import { tokenizeGraph } from "./tokenize";

export const qaTranslationGraph = defineTypedGraph({
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
            { signal: ctx.signal },
          ),
          runGraph(
            tokenizeGraph,
            { text: data.elementText },
            { signal: ctx.signal },
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
          { signal: ctx.signal },
        );

        await db.transaction(async (tx) => {
          const resultRow = await executeCommand({ db: tx }, createQaResult, {
            translationId: payload.translationId,
          });

          await executeCommand({ db: tx }, createQaResultItems, {
            resultId: resultRow.id,
            items: qa.result.map((item) => ({
              isPassed: item.isPassed,
              checkerId: item.checkerId,
              meta: item.meta,
            })),
          });
        });

        return {};
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

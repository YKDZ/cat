import {
  createQaResult,
  createQaResultItems,
  executeCommand,
  getTranslationQaContext,
  listProjectGlossaryIds,
} from "@cat/domain";
import * as z from "zod/v4";

import { runAgentQuery, withAgentDbTransaction } from "@/db/domain";
import { defineGraphWorkflow } from "@/workflow/define-task";

import { qaWorkflow } from "./qa";
import { tokenizeTask } from "./tokenize";

export const qaTranslationWorkflow = defineGraphWorkflow({
  name: "qa.translation",
  input: z.object({
    translationId: z.int(),
  }),
  output: z.object({}),
  steps: async (payload, { traceId, signal }) => {
    const data = await runAgentQuery(getTranslationQaContext, {
      translationId: payload.translationId,
    });

    if (!data) {
      throw new Error(
        `Translation ${payload.translationId} not found for QA workflow`,
      );
    }

    return [
      tokenizeTask.asStep(
        { text: data.translationText },
        { traceId, signal, stepId: "translation" },
      ),
      tokenizeTask.asStep(
        { text: data.elementText },
        { traceId, signal, stepId: "element" },
      ),
    ];
  },
  handler: async (payload, ctx) => {
    const [translationResult] = ctx.getStepResult(tokenizeTask, "translation");
    const [elementResult] = ctx.getStepResult(tokenizeTask, "element");

    const data = await runAgentQuery(getTranslationQaContext, {
      translationId: payload.translationId,
    });

    if (!data) {
      throw new Error(
        `Translation ${payload.translationId} not found for QA workflow`,
      );
    }

    const glossaryIds = await runAgentQuery(listProjectGlossaryIds, {
      projectId: data.projectId,
    });

    const { result } = await qaWorkflow.run(
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
        pub: false,
      },
      {
        runId: ctx.runId,
        traceId: ctx.traceId,
        signal: ctx.signal,
        pluginManager: ctx.pluginManager,
      },
    );

    const qa = await result();

    await withAgentDbTransaction(async (tx) => {
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
});

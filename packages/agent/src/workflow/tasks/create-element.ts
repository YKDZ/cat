import { createElements } from "@cat/domain";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import { zip } from "@cat/shared/utils";
import * as z from "zod/v4";

import { runAgentCommand } from "@/db/domain";
import { defineGraphWorkflow } from "@/workflow/define-task";

import { createTranslatableStringTask } from "./create-translatable-string";

export const CreateElementInputSchema = z.object({
  data: z.array(
    z.object({
      meta: nonNullSafeZDotJson.optional(),
      creatorId: z.uuidv4().optional(),
      documentId: z.uuidv4(),
      text: z.string(),
      languageId: z.string(),
      sortIndex: z.int().optional(),
      sourceStartLine: z.int().nullable().optional(),
      sourceEndLine: z.int().nullable().optional(),
      sourceLocationMeta: safeZDotJson.optional(),
    }),
  ),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateElementOutputSchema = z.object({
  elementIds: z.array(z.int()),
});

export const createElementWorkflow = defineGraphWorkflow({
  name: "element.create",
  input: CreateElementInputSchema,
  output: CreateElementOutputSchema,
  steps: async (payload, { traceId, signal }) => {
    return [
      createTranslatableStringTask.asStep(
        {
          data: payload.data.map((item) => ({
            text: item.text,
            languageId: item.languageId,
          })),
          vectorizerId: payload.vectorizerId,
          vectorStorageId: payload.vectorStorageId,
        },
        { traceId, signal },
      ),
    ];
  },
  handler: async (payload, ctx) => {
    const [stringResult] = ctx.getStepResult(createTranslatableStringTask);

    if (!stringResult) {
      throw new Error("Failed to create translatable strings");
    }

    const elementIds = await runAgentCommand(createElements, {
      data: Array.from(zip(payload.data, stringResult.stringIds)).map(
        ([element, stringId]) => ({
          meta: element.meta ?? {},
          sortIndex: element.sortIndex ?? 0,
          creatorId: element.creatorId,
          documentId: element.documentId,
          stringId,
          sourceStartLine: element.sourceStartLine ?? null,
          sourceEndLine: element.sourceEndLine ?? null,
          sourceLocationMeta: element.sourceLocationMeta ?? null,
        }),
      ),
    });

    return { elementIds };
  },
});

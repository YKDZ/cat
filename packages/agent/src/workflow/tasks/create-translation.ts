import { createTranslations, executeCommand } from "@cat/domain";
import { insertMemory } from "@cat/operations";
import { safeZDotJson } from "@cat/shared/schema/json";
import { zip } from "@cat/shared/utils";
import * as z from "zod/v4";

import { withAgentDb, withAgentDbTransaction } from "@/db/domain";
import { generateCacheKey } from "@/graph/cache";
import { defineGraphWorkflow } from "@/workflow/define-task";

import { createTranslatableStringTask } from "./create-translatable-string";
import { qaTranslationWorkflow } from "./qa-translation";

export const CreateTranslationInputSchema = z.object({
  data: z.array(
    z.object({
      translatableElementId: z.int(),
      translatorId: z.uuidv4().optional(),
      text: z.string(),
      languageId: z.string(),
      meta: safeZDotJson.optional(),
    }),
  ),
  translatorId: z.uuidv4().nullable(),
  memoryIds: z.array(z.uuidv4()).default([]),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
  documentId: z.uuidv4().optional(),
  pub: z.boolean().default(false).optional(),
});

export const CreateTranslationOutputSchema = z.object({
  translationIds: z.array(z.int()),
  memoryItemIds: z.array(z.int()),
});

export const CreateTranslationPubPayloadSchema = z.object({
  documentId: z.uuidv4(),
  translationIds: z.array(z.int()),
});

export type CreateTranslationPubPayload = z.infer<
  typeof CreateTranslationPubPayloadSchema
>;

export const createTranslationWorkflow = defineGraphWorkflow({
  name: "translation.create",
  input: CreateTranslationInputSchema,
  output: CreateTranslationOutputSchema,

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

    if (payload.pub && !payload.documentId) {
      throw new Error("documentId must be specified when pub is true");
    }
    if (!stringResult) {
      throw new Error("Missing string creation result");
    }

    const sideEffectKey = `translations:${generateCacheKey({
      data: payload.data,
      translatorId: payload.translatorId,
      memoryIds: payload.memoryIds,
    })}`;
    const existing = await ctx.checkSideEffect<{
      translationIds: number[];
      memoryItemIds: number[];
    }>(sideEffectKey);
    if (existing !== null) {
      return existing;
    }

    const translationIds = await withAgentDb(async (db) => {
      return executeCommand({ db }, createTranslations, {
        data: Array.from(zip(payload.data, stringResult.stringIds)).map(
          ([item, stringId]) => ({
            translatableElementId: item.translatableElementId,
            translatorId: item.translatorId,
            meta: item.meta,
            stringId,
          }),
        ),
      });
    });

    if (payload.pub && payload.documentId) {
      ctx.addEvent({
        type: "workflow:translation:created",
        payload: {
          documentId: payload.documentId,
          translationIds,
        },
      });
    }

    let memoryItemIds: number[] = [];
    if (payload.memoryIds.length > 0) {
      await withAgentDbTransaction(async (tx) => {
        memoryItemIds = (
          await insertMemory(tx, payload.memoryIds, translationIds)
        ).memoryItemIds;
      });
    }

    await Promise.all(
      translationIds.map(async (translationId) => {
        const qaRun = await qaTranslationWorkflow.run(
          { translationId },
          {
            runId: ctx.runId,
            traceId: ctx.traceId,
            signal: ctx.signal,
            pluginManager: ctx.pluginManager,
          },
        );

        await qaRun.result();
      }),
    );

    const output = {
      translationIds,
      memoryItemIds,
    };

    await ctx.recordSideEffect(sideEffectKey, "db_write", output);

    return output;
  },
});

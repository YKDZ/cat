import { createTranslations, executeCommand, getDbHandle } from "@cat/domain";
import { insertMemory } from "@cat/operations";
import { safeZDotJson } from "@cat/shared/schema/json";
import { zip } from "@cat/shared/utils";
import * as z from "zod/v4";

import { generateCacheKey } from "@/graph/cache";
import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";
import { runGraph } from "@/graph/typed-dsl/run-graph";

import { createTranslatableStringGraph } from "./create-translatable-string";
import { qaTranslationGraph } from "./qa-translation";

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

export const createTranslationGraph = defineTypedGraph({
  id: "translation-create",
  input: CreateTranslationInputSchema,
  output: CreateTranslationOutputSchema,
  nodes: {
    main: defineNode({
      input: CreateTranslationInputSchema,
      output: CreateTranslationOutputSchema,
      handler: async (input, ctx) => {
        const sideEffectKey = `translations:${generateCacheKey({
          data: input.data,
          translatorId: input.translatorId,
          memoryIds: input.memoryIds,
        })}`;
        const existing = await ctx.checkSideEffect<{
          translationIds: number[];
          memoryItemIds: number[];
        }>(sideEffectKey);
        if (existing !== null) {
          return existing;
        }

        const { stringIds } = await runGraph(
          createTranslatableStringGraph,
          {
            data: input.data.map((item) => ({
              text: item.text,
              languageId: item.languageId,
            })),
            vectorizerId: input.vectorizerId,
            vectorStorageId: input.vectorStorageId,
          },
          { signal: ctx.signal },
        );

        const { client: translationDb } = await getDbHandle();
        const translationIds = await executeCommand(
          { db: translationDb },
          createTranslations,
          {
            data: Array.from(zip(input.data, stringIds)).map(
              ([item, stringId]) => ({
                translatableElementId: item.translatableElementId,
                translatorId: item.translatorId,
                meta: item.meta,
                stringId,
              }),
            ),
          },
        );

        ctx.addEvent({
          type: "workflow:translation:created",
          payload: {
            documentId: input.documentId,
            translationIds,
          },
        });

        let memoryItemIds: number[] = [];
        if (input.memoryIds.length > 0) {
          const { client: memoryDb } = await getDbHandle();
          await memoryDb.transaction(async (tx) => {
            memoryItemIds = (
              await insertMemory(tx, input.memoryIds, translationIds)
            ).memoryItemIds;
          });
        }

        await Promise.all(
          translationIds.map(async (translationId) => {
            await runGraph(
              qaTranslationGraph,
              { translationId },
              { signal: ctx.signal },
            );
          }),
        );

        const output = { translationIds, memoryItemIds };
        await ctx.recordSideEffect(sideEffectKey, "db_write", output);
        return output;
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

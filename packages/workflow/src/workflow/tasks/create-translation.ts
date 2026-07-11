import { randomUUID } from "node:crypto";

import {
  createTranslations,
  executeCommand,
  executeQuery,
  getDbHandle,
  getTranslationCreatedEventContext,
} from "@cat/domain";
import { insertMemory } from "@cat/operations";
import type { SerializableType } from "@cat/shared";
import { safeZDotJson } from "@cat/shared";
import { zip } from "@cat/shared";
import * as z from "zod";

import { generateCacheKey } from "#/graph/cache.ts";
import { defineNode, defineGraph } from "#/graph/dsl/index.ts";
import { runGraph } from "#/graph/dsl/run-graph.ts";
import { executeWithVCS } from "#/graph/vcs-write-helper.ts";

import { createVectorizedStringGraph } from "./create-vectorized-string.ts";
import { qaTranslationGraph } from "./qa-translation.ts";

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
});

export const CreateTranslationOutputSchema = z.object({
  translationIds: z.array(z.int()),
  memoryItemIds: z.array(z.int()),
});

export const CreateTranslationPubPayloadSchema = z.object({
  projectId: z.uuidv4(),
  translationIds: z.array(z.int()),
  elementIds: z.array(z.int()),
  primaryContentNodeIds: z.array(z.uuidv4()),
});

export type CreateTranslationPubPayload = z.infer<
  typeof CreateTranslationPubPayloadSchema
>;

export const createTranslationGraph = defineGraph({
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
          createVectorizedStringGraph,
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
        const batchEntityId = randomUUID();
        const vcsPayload: SerializableType = {
          data: input.data.map((item) => ({
            translatableElementId: item.translatableElementId,
            text: item.text,
            languageId: item.languageId,
            ...(item.translatorId === undefined
              ? {}
              : { translatorId: item.translatorId }),
            ...(item.meta === undefined ? {} : { meta: item.meta }),
          })),
        };
        const translationIds = await executeWithVCS(
          ctx,
          "translation",
          batchEntityId,
          "CREATE",
          null,
          vcsPayload,
          async () =>
            executeCommand({ db: translationDb }, createTranslations, {
              data: Array.from(zip(input.data, stringIds)).map(
                ([item, stringId]) => ({
                  translatableElementId: item.translatableElementId,
                  translatorId: item.translatorId,
                  meta: item.meta,
                  stringId,
                }),
              ),
            }),
        );

        const eventContexts = await executeQuery(
          { db: translationDb },
          getTranslationCreatedEventContext,
          { translationIds },
        );

        await Promise.all(
          eventContexts.map(async (payload) =>
            ctx.emit({ type: "workflow:translation:created", payload }),
          ),
        );

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

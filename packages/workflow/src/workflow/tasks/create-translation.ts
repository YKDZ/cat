import { createHash, randomUUID } from "node:crypto";

import {
  createTranslations,
  executeCommand,
  executeQuery,
  getDbHandle,
  getTranslationCreatedEventContext,
  assertActiveAgentRunOwnership,
} from "@cat/domain";
import { insertMemory } from "@cat/operations";
import type { SerializableType } from "@cat/shared";
import {
  safeZDotJson,
  ScopeTranslationSeedSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
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
      durableScopeTranslationSeed: ScopeTranslationSeedSchema.optional(),
    }),
  ),
  translatorId: z.uuidv4().nullable(),
  memoryIds: z.array(z.uuidv4()).default([]),
  vectorizer: ServiceImplementationReferenceSchema,
  vectorStorage: ServiceImplementationReferenceSchema,
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

export const CREATE_TRANSLATION_WRITE_NODE_ID = "main";

const deterministicUuid = (value: string): string => {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 32);
  const chars = hash.split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(
    16,
  );
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
};

export const createTranslationGraph = defineGraph({
  id: "translation-create",
  input: CreateTranslationInputSchema,
  output: CreateTranslationOutputSchema,
  nodes: {
    [CREATE_TRANSLATION_WRITE_NODE_ID]: defineNode({
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
        const durableWriteKey = `owned-element-write:${input.data
          .map((item) => item.translatableElementId)
          .sort((left, right) => left - right)
          .join(",")}`;
        const durable = ctx.ownershipFence
          ? await ctx.checkSideEffect<{
              translationIds: number[];
            }>(durableWriteKey)
          : null;

        const { client: translationDb } = await getDbHandle();
        let translationIds = durable?.translationIds ?? null;
        if (translationIds === null) {
          const { stringIds } = await runGraph(
            createVectorizedStringGraph,
            {
              data: input.data.map((item) => ({
                text: item.text,
                languageId: item.languageId,
              })),
              vectorizer: input.vectorizer,
              vectorStorage: input.vectorStorage,
            },
            {
              signal: ctx.signal,
              ownershipFence: ctx.ownershipFence,
              assertRunOwnership: ctx.assertRunOwnership,
              vcsContext: ctx.vcsContext,
              vcsMiddleware: ctx.vcsMiddleware,
            },
          );

          await ctx.assertRunOwnership();
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
          translationIds = await executeWithVCS(
            ctx,
            "translation",
            batchEntityId,
            "CREATE",
            null,
            vcsPayload,
            async () => {
              await ctx.assertRunOwnership();
              return await executeCommand(
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
                  ...(ctx.ownershipFence
                    ? {
                        ownershipFence: ctx.ownershipFence,
                        workflowOutput: {
                          nodeId: ctx.nodeId,
                          outputKey: durableWriteKey,
                          idempotencyKey: `${ctx.nodeId}:${ctx.ownershipFence.runId}:${durableWriteKey}`,
                          payload: {
                            durableOutcomes: input.data.flatMap((item) =>
                              item.durableScopeTranslationSeed
                                ? [
                                    {
                                      translatableElementId:
                                        item.translatableElementId,
                                      scopeTranslationSeed:
                                        item.durableScopeTranslationSeed,
                                    },
                                  ]
                                : [],
                            ),
                          },
                        },
                      }
                    : {}),
                },
              );
            },
          );
        }

        const eventContexts = await executeQuery(
          { db: translationDb },
          getTranslationCreatedEventContext,
          { translationIds },
        );

        await Promise.all(
          eventContexts.map(async (payload) => {
            const eventPhaseKey = `translation-event:${payload.projectId}:${payload.translationIds.join(",")}`;
            const published = await ctx.checkSideEffect(eventPhaseKey);
            if (published !== null) return;
            await ctx.emit({
              eventId: deterministicUuid(
                `${ctx.ownershipFence?.runId ?? ctx.runId}:translation-created:${payload.projectId}:${payload.translationIds.join(",")}`,
              ),
              type: "workflow:translation:created",
              payload,
            });
            await ctx.recordSideEffect(eventPhaseKey, "event_publish", payload);
          }),
        );

        let memoryItemIds: number[] = [];
        if (input.memoryIds.length > 0) {
          const memoryPhaseKey = `translation-memory:${input.memoryIds
            .toSorted()
            .join(",")}:${translationIds.join(",")}`;
          const persistedMemory =
            await ctx.checkSideEffect<number[]>(memoryPhaseKey);
          if (persistedMemory !== null) {
            memoryItemIds = persistedMemory;
          } else {
            const { client: memoryDb } = await getDbHandle();
            await memoryDb.transaction(async (tx) => {
              if (ctx.ownershipFence) {
                await assertActiveAgentRunOwnership(tx, ctx.ownershipFence);
              }
              memoryItemIds = (
                await insertMemory(tx, input.memoryIds, translationIds)
              ).memoryItemIds;
            });
            await ctx.recordSideEffect(
              memoryPhaseKey,
              "db_write",
              memoryItemIds,
            );
          }
        }

        await Promise.all(
          translationIds.map(async (translationId) => {
            await runGraph(
              qaTranslationGraph,
              { translationId },
              {
                signal: ctx.signal,
                ownershipFence: ctx.ownershipFence,
                assertRunOwnership: ctx.assertRunOwnership,
                vcsContext: ctx.vcsContext,
                vcsMiddleware: ctx.vcsMiddleware,
              },
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
  entry: CREATE_TRANSLATION_WRITE_NODE_ID,
  exit: [CREATE_TRANSLATION_WRITE_NODE_ID],
});

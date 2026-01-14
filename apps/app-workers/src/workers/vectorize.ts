import { defineTask } from "@/core";
import { chunk, chunkSet, getDrizzleDB } from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import type { JSONType } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import z from "zod";

const InputSchema = z.object({
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
  data: z.array(
    z.object({
      languageId: z.string(),
      text: z.string(),
    }),
  ),
});

const OutputSchema = z.object({
  chunkSetIds: z.array(z.int()),
});

export const vectorizeToChunkSetTask = await defineTask({
  name: "vectorize",
  input: InputSchema,
  output: OutputSchema,

  handler: async ({ data, vectorStorageId, vectorizerId }) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginManager = PluginManager.get("GLOBAL", "");

    if (data.length === 0) return { chunkSetIds: [] };

    const vectorizer = assertSingleNonNullish(
      pluginManager
        .getServices("TEXT_VECTORIZER")
        .filter((s) => s.dbId === vectorizerId),
    ).service;
    const storage = assertSingleNonNullish(
      pluginManager
        .getServices("VECTOR_STORAGE")
        .filter((s) => s.dbId === vectorStorageId),
    ).service;

    const chunkDataList = await vectorizer.vectorize({ elements: data });
    if (chunkDataList.length !== data.length) {
      throw new Error("Vectorizer result length mismatch with input texts");
    }

    const numSets = chunkDataList.length;
    const chunkSetRows = Array.from({ length: numSets }, () => ({}));

    type Flattened = {
      vector: number[];
      meta: JSONType;
      textIndex: number;
      chunkIndex: number;
    };
    const flattened: Flattened[] = [];

    const chunkRowsToInsert: Array<{
      chunkSetId?: number;
      vectorizerId: number;
      vectorStorageId: number;
      meta: JSONType;
    }> = [];

    for (let i = 0; i < chunkDataList.length; i += 1) {
      const chunkData = chunkDataList[i];
      for (let j = 0; j < chunkData.length; j += 1) {
        flattened.push({
          vector: chunkData[j].vector,
          meta: chunkData[j].meta,
          textIndex: i,
          chunkIndex: j,
        });

        chunkRowsToInsert.push({
          vectorizerId,
          vectorStorageId,
          meta: chunkData[j].meta,
        });
      }
    }

    const { insertedChunks, chunkSetIds } = await drizzle.transaction(
      async (tx) => {
        const insertedChunkSets = await tx
          .insert(chunkSet)
          .values(chunkSetRows)
          .returning({ id: chunkSet.id });

        const chunkSetIds: number[] = insertedChunkSets.map((r) => r.id);

        const finalChunkRows = flattened.map((f) => ({
          chunkSetId: chunkSetIds[f.textIndex],
          vectorizerId,
          vectorStorageId,
          meta: f.meta,
        }));

        return {
          insertedChunks: await tx
            .insert(chunk)
            .values(finalChunkRows)
            .returning({ id: chunk.id }),
          chunkSetIds,
        };
      },
    );

    const chunkIds: number[] = insertedChunks.map((r) => r.id);

    const storePayload = chunkIds.map((cid, idx) => ({
      chunkId: cid,
      vector: flattened[idx].vector,
      meta: flattened[idx].meta,
    }));

    await storage.store({ chunks: storePayload });

    return { chunkSetIds };
  },
});

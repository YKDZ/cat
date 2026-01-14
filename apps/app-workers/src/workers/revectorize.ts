import { defineTask } from "@/core";
import {
  chunk,
  chunkSet,
  eq,
  getDrizzleDB,
  inArray,
  translatableString,
} from "@cat/db";
import { PluginManager, TextVectorizer, VectorStorage } from "@cat/plugin-core";
import { z } from "zod";

export const RevectorizeInputSchema = z.object({
  chunkIds: z.array(z.int()),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const RevectorizeOutputSchema = z.object();

export const revectorizeTask = await defineTask({
  name: "revectorizer",
  input: RevectorizeInputSchema,
  output: RevectorizeOutputSchema,

  handler: async (payload) => {
    const { chunkIds, vectorizerId, vectorStorageId } = payload;

    if (chunkIds.length === 0) return {};

    const { client: db } = await getDrizzleDB();
    const pluginManager = PluginManager.get("GLOBAL", "");

    // 1. Fetch source text for given chunks
    // Assumes TranslatableString -> ChunkSet -> Chunk relationship
    const chunksData = await db
      .select({
        chunkId: chunk.id,
        text: translatableString.value,
        languageId: translatableString.languageId,
      })
      .from(chunk)
      .innerJoin(chunkSet, eq(chunk.chunkSetId, chunkSet.id))
      // Use innerJoin to ensure we find the text. If no text, we can't re-vectorize.
      .innerJoin(
        translatableString,
        eq(translatableString.chunkSetId, chunkSet.id),
      )
      .where(inArray(chunk.id, chunkIds));

    if (chunksData.length === 0) return {};

    // 2. Resolve Plugin Services
    const vectorizerService = pluginManager
      .getServices("TEXT_VECTORIZER")
      .find((s) => s.dbId === vectorizerId)?.service as
      | TextVectorizer
      | undefined;

    const storageService = pluginManager
      .getServices("VECTOR_STORAGE")
      .find((s) => s.dbId === vectorStorageId)?.service as
      | VectorStorage
      | undefined;

    if (!vectorizerService || !storageService) {
      throw new Error(
        `Service not found. Vectorizer: ${vectorizerId}, Storage: ${vectorStorageId}`,
      );
    }

    // 3. Process Chunk by Chunk (to maintain ID mapping)
    // We assume 1 Chunk -> 1 Vector. If vectorizer output splits, we take first/all?
    // Since we are updating specific chunkId, we expect 1:1.
    // However, vectorizer.vectorize takes array. We can batch if efficient.
    // But we need to map Output[i] -> Input[i].chunkId.
    // `vectorize` returns VectorizedTextData[] corresponding to inputs.

    const inputs = chunksData.map((c) => ({
      text: c.text,
      languageId: c.languageId,
    }));

    const results = await vectorizerService.vectorize({ elements: inputs });

    if (results.length !== chunksData.length) {
      throw new Error(`Vectorizer returned mismatching results`);
    }

    // Prepare updates
    const storePayload: { chunkId: number; vector: number[] }[] = [];
    const chunkUpdates: {
      id: number;
      vectorizerId: number;
      vectorStorageId: number;
    }[] = [];

    for (let i = 0; i < chunksData.length; i += 1) {
      const chunkId = chunksData[i].chunkId;
      const result = results[i]; // VectorizedTextData (array of chunks)

      // We expect 1 vector per input chunk for simple re-vectorization (same segmentation)
      // If result has > 0 vectors, we take the first?
      // If we are just updating the embedding model, likely 1 string -> 1 vector.
      if (result.length > 0) {
        // Take the first vector
        const vectorData = result[0];
        storePayload.push({
          chunkId: chunkId,
          vector: vectorData.vector,
        });
        chunkUpdates.push({
          id: chunkId,
          vectorizerId: vectorizerId,
          vectorStorageId: vectorStorageId,
        });
      }
    }

    // 4. Store (Upsert) Vectors
    if (storePayload.length > 0) {
      await storageService.store({ chunks: storePayload });
    }

    // 5. Update Chunk Metadata (services)
    // We can do this in batch
    for (const update of chunkUpdates) {
      // oxlint-disable-next-line no-await-in-loop
      await db
        .update(chunk)
        .set({
          vectorizerId: update.vectorizerId,
          vectorStorageId: update.vectorStorageId,
        })
        .where(eq(chunk.id, update.id));
    }

    return {};
  },
});

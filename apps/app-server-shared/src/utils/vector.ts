import {
  chunk,
  chunkSet,
  DrizzleClient,
  inArray,
  OverallDrizzleClient,
  translatableString,
} from "@cat/db";
import { IVectorStorage, TextVectorizer } from "@cat/plugin-core";
import { JSONType } from "@cat/shared/schema/json";
import { UnvectorizedTextData } from "@cat/shared/schema/misc";

const vectorizeToChunkSetsBatch = async (
  drizzle: Omit<DrizzleClient, "$client">,
  vectorizer: TextVectorizer,
  vectorizerId: number,
  vectorStorage: IVectorStorage,
  vectorStorageId: number,
  texts: UnvectorizedTextData[],
): Promise<number[]> => {
  if (texts.length === 0) return [];

  const chunkDataList = await vectorizer.vectorize(texts);
  if (chunkDataList.length !== texts.length) {
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
    const chunkData = chunkDataList[i]; // array of { vector, meta }
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

  const { chunkSetIds, chunkIds } = await drizzle.transaction(async (tx) => {
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

    const insertedChunks = await tx
      .insert(chunk)
      .values(finalChunkRows)
      .returning({ id: chunk.id });

    const chunkIds: number[] = insertedChunks.map((r) => r.id);

    return { chunkSetIds, chunkIds };
  });

  try {
    const storePayload = chunkIds.map((cid, idx) => ({
      chunkId: cid,
      vector: flattened[idx].vector,
      meta: flattened[idx].meta,
    }));

    await vectorStorage.store(storePayload);
  } catch (err) {
    try {
      await drizzle.transaction(async (tx) => {
        if (chunkIds.length > 0) {
          await tx.delete(chunk).where(inArray(chunk.id, chunkIds));
        }
        if (chunkSetIds.length > 0) {
          await tx.delete(chunkSet).where(inArray(chunkSet.id, chunkSetIds));
        }
      });
    } catch (cleanupErr) {
      throw new Error(
        `vectorStorage.store failed: ${(err as Error).message}; cleanup also failed: ${
          (cleanupErr as Error).message
        }`,
      );
    }
    throw err;
  }

  return chunkSetIds;
};

export const createStringFromData = async (
  tx: OverallDrizzleClient,
  vectorizer: TextVectorizer,
  vectorizerId: number,
  vectorStorage: IVectorStorage,
  vectorStorageId: number,
  data: UnvectorizedTextData[],
): Promise<number[]> => {
  if (data.length === 0) return [];

  const uniqueEntries: { key: string; data: UnvectorizedTextData }[] = [];
  const seenKeys = new Set<string>();
  for (const item of data) {
    const key = item.value;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueEntries.push({ key, data: item });
    }
  }

  const idMap = new Map<string, number>();

  const existing = await tx
    .select({
      id: translatableString.id,
      value: translatableString.value,
      languageId: translatableString.languageId,
    })
    .from(translatableString)
    .where(
      inArray(
        translatableString.value,
        uniqueEntries.map((e) => e.key),
      ),
    );

  for (const r of existing) idMap.set(r.value, r.id);

  const missingEntries = uniqueEntries.filter((e) => !idMap.has(e.key));
  if (missingEntries.length === 0) {
    return data.map((item) => {
      const id = idMap.get(item.value)!;
      return id;
    });
  }

  const chunkSetIds = await vectorizeToChunkSetsBatch(
    tx as unknown as Omit<DrizzleClient, "$client">, // 根据你的类型调整传入
    vectorizer,
    vectorizerId,
    vectorStorage,
    vectorStorageId,
    missingEntries.map((e) => e.data),
  );

  const insertedRows = await tx
    .insert(translatableString)
    .values(
      missingEntries.map((entry, index) => ({
        value: entry.data.value,
        languageId: entry.data.languageId,
        chunkSetId: chunkSetIds[index],
      })),
    )
    .onConflictDoNothing()
    .returning({
      id: translatableString.id,
      value: translatableString.value,
      chunkSetId: translatableString.chunkSetId,
    });

  for (const row of insertedRows) idMap.set(row.value, row.id);

  const stillMissing = missingEntries.filter((e) => !idMap.has(e.key));
  if (stillMissing.length > 0) {
    const found = await tx
      .select({
        id: translatableString.id,
        value: translatableString.value,
      })
      .from(translatableString)
      .where(
        inArray(
          translatableString.value,
          stillMissing.map((s) => s.key),
        ),
      );

    for (const r of found) idMap.set(r.value, r.id);
  }

  return data.map((item) => {
    const id = idMap.get(item.value);
    if (id === undefined)
      throw new Error(
        "Failed to resolve translatable string id for value: " + item.value,
      );
    return id;
  });
};

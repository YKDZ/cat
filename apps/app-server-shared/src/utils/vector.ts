import {
  chunk,
  chunkSet,
  inArray,
  translatableString,
  and,
  eq,
  type DrizzleTransaction,
} from "@cat/db";
import { VectorStorage, TextVectorizer } from "@cat/plugin-core";
import { JSONType } from "@cat/shared/schema/json";
import { UnvectorizedTextData } from "@cat/shared/schema/misc";

const vectorizeToChunkSetsBatch = async (
  tx: DrizzleTransaction,
  vectorizer: TextVectorizer,
  vectorizerId: number,
  vectorStorage: VectorStorage,
  vectorStorageId: number,
  texts: UnvectorizedTextData[],
): Promise<number[]> => {
  if (texts.length === 0) return [];

  const chunkDataList = await vectorizer.vectorize({ elements: texts });
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

  const storePayload = chunkIds.map((cid, idx) => ({
    chunkId: cid,
    vector: flattened[idx].vector,
    meta: flattened[idx].meta,
  }));

  await vectorStorage.store({ chunks: storePayload });

  return chunkSetIds;
};

/**
 * 根据给定数据按以下规则返回 TranslatableString ID：\
 * 若数据库中没有 value + languageId 唯一冲突的行，插入并返回 ID；\
 * 若有，返回现存 ID。\
 * 返回的 ID 顺序与 data 保持一致\
 * 涉及多个数据库操作，需要一个事务传入
 *
 * @param tx
 * @param vectorizer
 * @param vectorizerId
 * @param vectorStorage
 * @param vectorStorageId
 * @param data
 * @returns TranslatableString IDs
 */
export const createStringFromData = async (
  tx: DrizzleTransaction,
  vectorizer: TextVectorizer,
  vectorizerId: number,
  vectorStorage: VectorStorage,
  vectorStorageId: number,
  data: UnvectorizedTextData[],
): Promise<number[]> => {
  if (data.length === 0) return [];

  const makeKey = (languageId: string, text: string) =>
    `${languageId}::${text}`;

  const uniqueEntries: { key: string; data: UnvectorizedTextData }[] = [];
  const seenKeys = new Set<string>();
  for (const item of data) {
    const key = makeKey(item.languageId, item.text);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueEntries.push({ key, data: item });
    }
  }

  const idMap = new Map<string, number>();

  if (uniqueEntries.length > 0) {
    const byLanguage = new Map<string, string[]>();
    for (const entry of uniqueEntries) {
      const langId = entry.data.languageId;
      if (!byLanguage.has(langId)) {
        byLanguage.set(langId, []);
      }
      byLanguage.get(langId)!.push(entry.data.text);
    }

    const languageIds = Array.from(byLanguage.keys());
    const queryPromises = languageIds.map((langId) => {
      const values = byLanguage.get(langId)!;
      return tx
        .select({
          id: translatableString.id,
          value: translatableString.value,
          languageId: translatableString.languageId,
        })
        .from(translatableString)
        .where(
          and(
            eq(translatableString.languageId, langId),
            inArray(translatableString.value, values),
          ),
        );
    });

    const results = await Promise.all(queryPromises);
    for (const existing of results) {
      for (const row of existing) {
        const key = makeKey(row.languageId, row.value);
        idMap.set(key, row.id);
      }
    }
  }

  const missingEntries = uniqueEntries.filter((e) => !idMap.has(e.key));
  if (missingEntries.length === 0) {
    return data.map((item) => {
      const key = makeKey(item.languageId, item.text);
      const id = idMap.get(key)!;
      return id;
    });
  }

  const BATCH_SIZE = 100;
  const missingChunks: (typeof missingEntries)[] = [];
  for (let i = 0; i < missingEntries.length; i += BATCH_SIZE) {
    missingChunks.push(missingEntries.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of missingChunks) {
    // eslint-disable-next-line no-await-in-loop 涉及向量化和数据库事务，不适合并行
    const chunkSetIds = await vectorizeToChunkSetsBatch(
      tx,
      vectorizer,
      vectorizerId,
      vectorStorage,
      vectorStorageId,
      chunk.map((e) => e.data),
    );

    // eslint-disable-next-line no-await-in-loop
    const insertedRows = await tx
      .insert(translatableString)
      .values(
        chunk.map((entry, index) => ({
          value: entry.data.text,
          languageId: entry.data.languageId,
          chunkSetId: chunkSetIds[index],
        })),
      )
      .onConflictDoNothing()
      .returning({
        id: translatableString.id,
        value: translatableString.value,
        languageId: translatableString.languageId,
        chunkSetId: translatableString.chunkSetId,
      });

    for (const row of insertedRows) {
      const key = makeKey(row.languageId, row.value);
      idMap.set(key, row.id);
    }

    // 处理并发插入的情况（onConflictDoNothing 导致的缺失）
    const stillMissingInChunk = chunk.filter((e) => !idMap.has(e.key));
    if (stillMissingInChunk.length > 0) {
      // 使用优化后的查询方式
      const byLanguage = new Map<string, string[]>();
      for (const entry of stillMissingInChunk) {
        const langId = entry.data.languageId;
        if (!byLanguage.has(langId)) {
          byLanguage.set(langId, []);
        }
        byLanguage.get(langId)!.push(entry.data.text);
      }

      // 并行查询所有语言
      const queryPromises = Array.from(byLanguage.entries()).map(
        ([langId, values]) =>
          tx
            .select({
              id: translatableString.id,
              value: translatableString.value,
              languageId: translatableString.languageId,
            })
            .from(translatableString)
            .where(
              and(
                eq(translatableString.languageId, langId),
                inArray(translatableString.value, values),
              ),
            ),
      );

      // eslint-disable-next-line no-await-in-loop
      const foundResults = await Promise.all(queryPromises);
      for (const found of foundResults) {
        for (const r of found) {
          const key = makeKey(r.languageId, r.value);
          idMap.set(key, r.id);
        }
      }
    }
  }

  return data.map((item) => {
    const key = makeKey(item.languageId, item.text);
    const id = idMap.get(key);
    if (id === undefined)
      throw new Error(
        `Failed to resolve translatable string id for languageId: ${item.languageId}, text: ${item.text}`,
      );
    return id;
  });
};

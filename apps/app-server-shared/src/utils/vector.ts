// oxlint-disable no-await-in-loop
import {
  chunk,
  chunkSet,
  DrizzleClient,
  OverallDrizzleClient,
  sql,
  translatableString,
} from "@cat/db";
import { IVectorStorage, TextVectorizer } from "@cat/plugin-core";
import { UnvectorizedTextData } from "@cat/shared/schema/misc";
import { assertSingleNonNullish } from "@cat/shared/utils";

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
    const key = JSON.stringify([item.value, item.languageId]);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueEntries.push({ key, data: item });
    }
  }

  const idMap = new Map<string, number>();

  if (uniqueEntries.length !== 0) {
    const tuples = uniqueEntries.map(
      ({ data: item }) => sql`(${item.value}, ${item.languageId})`,
    );

    const existingStrings = await tx
      .select({
        id: translatableString.id,
        value: translatableString.value,
        languageId: translatableString.languageId,
      })
      .from(translatableString)
      .where(
        sql`(${translatableString.value}, ${translatableString.languageId}) in (${sql.join(tuples, sql`, `)})`,
      );

    for (const row of existingStrings) {
      const key = JSON.stringify([row.value, row.languageId]);
      idMap.set(key, row.id);
    }
  }

  const missingEntries = uniqueEntries.filter((entry) => !idMap.has(entry.key));

  if (missingEntries.length !== 0) {
    const chunkSetIds = await vectorizeToChunkSets(
      tx,
      vectorizer,
      vectorizerId,
      vectorStorage,
      vectorStorageId,
      missingEntries.map((entry) => entry.data),
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
      .returning({
        id: translatableString.id,
        value: translatableString.value,
        languageId: translatableString.languageId,
      });

    for (const row of insertedRows) {
      const key = JSON.stringify([row.value, row.languageId]);
      idMap.set(key, row.id);
    }
  }

  return data.map((item) => {
    const key = JSON.stringify([item.value, item.languageId]);
    const id = idMap.get(key);
    if (id === undefined)
      throw new Error("Failed to resolve translatable string id");
    return id;
  });
};

export const vectorizeToChunkSets = async (
  drizzle: Omit<DrizzleClient, "$client">,
  vectorizer: TextVectorizer,
  vectorizerId: number,
  vectorStorage: IVectorStorage,
  vectorStorageId: number,
  texts: UnvectorizedTextData[],
): Promise<number[]> => {
  if (texts.length === 0) {
    return [];
  }

  const chunkDataList = await vectorizer.vectorize(texts);

  if (chunkDataList.length !== texts.length) {
    throw new Error("Vectorizer result length mismatch with input texts");
  }

  return await drizzle.transaction(async (tx) => {
    const chunkSetIds: number[] = [];

    for (const chunkData of chunkDataList) {
      const { id: chunkSetId } = assertSingleNonNullish(
        await tx.insert(chunkSet).values({}).returning({ id: chunkSet.id }),
      );

      const chunkIds = (
        await tx
          .insert(chunk)
          .values(
            chunkData.map((data) => ({
              chunkSetId,
              vectorizerId,
              vectorStorageId,
              meta: data.meta,
            })),
          )
          .returning({ id: chunk.id })
      ).map((chunk) => chunk.id);

      await vectorStorage.store(
        chunkIds.map((chunkId, index) => ({
          chunkId,
          vector: chunkData[index].vector,
          meta: chunkData[index].meta,
        })),
      );

      chunkSetIds.push(chunkSetId);
    }

    return chunkSetIds;
  });
};

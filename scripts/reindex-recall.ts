#!/usr/bin/env tsx

export {};

import { DrizzleDB } from "../packages/db/src/drizzle/db.ts";
import {
  memoryItem,
  termConcept,
  vectorizedString,
} from "../packages/db/src/drizzle/schema/schema.ts";
import { aliasedTable, eq } from "../packages/db/src/index.ts";
import { buildMemoryRecallVariantsOp } from "../packages/operations/src/build-memory-recall-variants.ts";
import { buildTermRecallVariantsOp } from "../packages/operations/src/build-term-recall-variants.ts";

type Args = {
  conceptId?: number;
  glossaryId?: string;
  memoryId?: string;
};

const REINDEX_BATCH_SIZE = 10;

const writeLine = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const createBatches = <T>(items: readonly T[], batchSize: number): T[][] => {
  return Array.from(
    { length: Math.ceil(items.length / batchSize) },
    (_unused, index) => items.slice(index * batchSize, (index + 1) * batchSize),
  );
};

const runInBatches = async <T>(
  items: readonly T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
  const batches = createBatches(items, batchSize);

  await batches.reduce(async (previousBatch, batch) => {
    await previousBatch;
    await Promise.all(batch.map(async (item) => worker(item)));
  }, Promise.resolve());
};

const parseArgs = (): Args => {
  const args = process.argv.slice(2);
  const readValue = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };

  const conceptRaw = readValue("--concept");
  const conceptId =
    conceptRaw === undefined ? undefined : Number.parseInt(conceptRaw, 10);
  if (conceptRaw !== undefined && Number.isNaN(conceptId)) {
    throw new Error("--concept requires a numeric concept ID");
  }

  return {
    conceptId,
    glossaryId: readValue("--glossary"),
    memoryId: readValue("--memory"),
  };
};

const db = new DrizzleDB();
await db.connect();
globalThis.__DRIZZLE_DB__ = db;

const { conceptId, glossaryId, memoryId } = parseArgs();
const drizzle = db.client;

try {
  const conceptRows = await drizzle
    .select({ conceptId: termConcept.id })
    .from(termConcept)
    .where(
      conceptId !== undefined
        ? eq(termConcept.id, conceptId)
        : glossaryId !== undefined
          ? eq(termConcept.glossaryId, glossaryId)
          : undefined,
    );

  const uniqueConceptIds = [
    ...new Set(conceptRows.map((row) => row.conceptId)),
  ];
  writeLine(`Reindexing ${uniqueConceptIds.length} term concepts...`);
  await runInBatches(uniqueConceptIds, REINDEX_BATCH_SIZE, async (id) => {
    await buildTermRecallVariantsOp({ conceptId: id });
  });

  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");
  const memoryRows = await drizzle
    .select({
      memoryItemId: memoryItem.id,
      memoryId: memoryItem.memoryId,
      sourceText: sourceString.value,
      translationText: translationString.value,
      sourceLanguageId: sourceString.languageId,
      translationLanguageId: translationString.languageId,
    })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .where(
      memoryId !== undefined ? eq(memoryItem.memoryId, memoryId) : undefined,
    );

  writeLine(`Reindexing ${memoryRows.length} memory items...`);
  await runInBatches(memoryRows, REINDEX_BATCH_SIZE, async (row) => {
    await buildMemoryRecallVariantsOp({
      memoryItemId: row.memoryItemId,
      memoryId: row.memoryId,
      sourceText: row.sourceText,
      translationText: row.translationText,
      sourceLanguageId: row.sourceLanguageId,
      translationLanguageId: row.translationLanguageId,
    });
  });

  writeLine("Recall reindex complete.");
} finally {
  await db.disconnect();
}

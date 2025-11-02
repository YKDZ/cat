import {
  and,
  blob,
  DrizzleClient,
  eq,
  file,
  getDrizzleDB,
  task as taskTable,
} from "@cat/db";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import {
  PluginRegistry,
  StorageProvider,
  type TranslatableFileHandler,
} from "@cat/plugin-core";
import {
  getServiceFromDBId,
  readableToBuffer,
} from "@cat/app-server-shared/utils";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";
import {
  batchDiffElementsQueue,
  batchDiffElementsQueueEvents,
} from "@/workers/batchDiffElements.ts";
import { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";

const { client: drizzle } = await getDrizzleDB();

const queueId = "upsertDocumentElementsFromFile";

export const upsertDocumentElementsFromFileQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { documentId, fileId, languageId } = z
      .object({
        documentId: z.uuidv7(),
        fileId: z.int(),
        languageId: z.string(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const dbFile = await drizzle.query.file.findFirst({
      where: (file, { eq }) => eq(file.id, fileId),
    });

    if (!dbFile) throw new Error("File not found");

    const dbDocument = await drizzle.query.document.findFirst({
      where: (document, { eq }) => eq(document.id, documentId),
      columns: {
        fileHandlerId: true,
      },
    });

    if (!dbDocument || !dbDocument.fileHandlerId)
      throw new Error("Document not found");

    const handler = await getServiceFromDBId<TranslatableFileHandler>(
      drizzle,
      pluginRegistry,
      dbDocument.fileHandlerId,
    );

    const newElementsData = (
      await extractElementsFromFile(drizzle, pluginRegistry, handler, dbFile.id)
    ).map((el) => ({ ...el, languageId }));

    const oldElementIds = (
      await drizzle.query.translatableElement.findMany({
        where: (document, { eq }) => eq(document.documentId, documentId),
        columns: {
          id: true,
        },
      })
    ).map((el) => el.id);

    const dbTask = assertSingleNonNullish(
      await drizzle
        .insert(taskTable)
        .values([
          {
            type: "upsertDocumentElementsFromFile",
          },
        ])
        .returning({ id: taskTable.id }),
    );

    const task = await batchDiffElementsQueue.add(dbTask.id, {
      newElementsData,
      oldElementIds,
      sourceLanguageId: languageId,
      documentId,
    });

    await task.waitUntilFinished(batchDiffElementsQueueEvents);
  },
  {
    ...config,
  },
);

const extractElementsFromFile = async (
  drizzle: DrizzleClient,
  pluginRegistry: PluginRegistry,
  handler: TranslatableFileHandler,
  fileId: number,
): Promise<TranslatableElementDataWithoutLanguageId[]> => {
  const { key, storageProviderId } = assertSingleNonNullish(
    await drizzle
      .select({
        key: blob.key,
        storageProviderId: blob.storageProviderId,
      })
      .from(file)
      .innerJoin(blob, eq(blob.id, file.blobId))
      .where(and(eq(file.id, fileId), eq(file.isActive, true))),
    `File ${fileId} not found`,
  );

  const provider = await getServiceFromDBId<StorageProvider>(
    drizzle,
    pluginRegistry,
    storageProviderId,
  );

  const fileContent = await readableToBuffer(await provider.getStream(key));

  const newElements = sortAndAssignIndex(
    await handler.extractElement(fileContent),
  );

  return newElements;
};

const sortAndAssignIndex = (
  elements: TranslatableElementDataWithoutLanguageId[],
): (TranslatableElementDataWithoutLanguageId & { sortIndex: number })[] => {
  const withSortIndex: (TranslatableElementDataWithoutLanguageId & {
    sortIndex: number;
  })[] = [];
  const withoutSortIndex: {
    item: TranslatableElementDataWithoutLanguageId;
    originalIndex: number;
  }[] = [];

  elements.forEach((item, idx) => {
    if (typeof item.sortIndex === "number") {
      withSortIndex.push({
        ...item,
        sortIndex: item.sortIndex,
      });
    } else {
      withoutSortIndex.push({ item, originalIndex: idx });
    }
  });

  withSortIndex.sort((a, b) => a.sortIndex - b.sortIndex);

  const maxSortIndex =
    withSortIndex.length > 0
      ? Math.max(...withSortIndex.map((i) => i.sortIndex))
      : -1;

  let currentIndex = maxSortIndex + 1;
  const assignedWithoutSortIndex = withoutSortIndex
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map(({ item }) => ({
      ...item,
      sortIndex: (currentIndex += 1),
    }));

  return [...withSortIndex, ...assignedWithoutSortIndex];
};

registerTaskUpdateHandlers(drizzle, worker, queueId);

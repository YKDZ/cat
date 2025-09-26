import { getDrizzleDB, task as taskTable } from "@cat/db";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { PluginRegistry, type TranslatableFileHandler } from "@cat/plugin-core";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { extractElementsFromFile } from "@cat/app-server-shared/utils";
import { getSingle } from "@cat/shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";
import {
  batchDiffElementsQueue,
  batchDiffElementsQueueEvents,
} from "@/workers/batchDiffElements.ts";

const { client: drizzle } = await getDrizzleDB();

const queueId = "upsertDocumentElementsFromFile";

export const upsertDocumentElementsFromFileQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { documentId, fileId, vectorizerId } = z
      .object({
        documentId: z.uuidv7(),
        fileId: z.int(),
        vectorizerId: z.int(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const dbFile = await drizzle.query.file.findFirst({
      where: (file, { eq }) => eq(file.id, fileId),
    });

    // const dbFile = await drizzle.file.findUnique({
    //   where: {
    //     id: fileId,
    //   },
    // });

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

    const newElementsData = await extractElementsFromFile(
      drizzle,
      pluginRegistry,
      handler,
      dbFile.id,
    );

    const oldElementIds = (
      await drizzle.query.translatableElement.findMany({
        where: (document, { eq }) => eq(document.documentId, documentId),
        columns: {
          id: true,
        },
      })
    ).map((el) => el.id);

    const dbTask = getSingle(
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
      vectorizerId,
      sourceLanguageId: "zh_cn",
      newElementMeta: {
        documentId,
      },
    });

    await task.waitUntilFinished(batchDiffElementsQueueEvents);
  },
  {
    ...config,
  },
);

registerTaskUpdateHandlers(drizzle, worker, queueId);

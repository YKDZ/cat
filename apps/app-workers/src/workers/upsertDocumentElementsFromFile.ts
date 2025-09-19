import { getPrismaDB } from "@cat/db";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { PluginRegistry, type TranslatableFileHandler } from "@cat/plugin-core";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { extractElementsFromFile } from "@cat/app-server-shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";
import {
  batchDiffElementsQueue,
  batchDiffElementsQueueEvents,
} from "@/workers/batchDiffElements.ts";

const { client: prisma } = await getPrismaDB();

const queueId = "upsertDocumentElementsFromFile";

export const upsertDocumentElementsFromFileQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { documentId, fileId, vectorizerId } = z
      .object({
        documentId: z.ulid(),
        fileId: z.int(),
        vectorizerId: z.int(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const dbFile = await prisma.file.findUnique({
      where: {
        id: fileId,
      },
    });

    if (!dbFile) throw new Error("File not found");

    const dbDocument = await prisma.document.findUniqueOrThrow({
      where: {
        id: documentId,
      },
      select: {
        fileHandlerId: true,
      },
    });

    if (!dbDocument.fileHandlerId) throw new Error("Document not found");

    const handler = await getServiceFromDBId<TranslatableFileHandler>(
      prisma,
      pluginRegistry,
      dbDocument.fileHandlerId,
    );

    const newElementsData = await extractElementsFromFile(
      prisma,
      pluginRegistry,
      handler,
      dbFile.id,
    );

    const oldElementIds = (
      await prisma.translatableElement.findMany({
        where: {
          documentId,
        },
        select: {
          id: true,
        },
      })
    ).map((el) => el.id);

    const dbTask = await prisma.task.create({
      data: { type: "upsertDocumentElementsFromFile" },
      select: {
        id: true,
      },
    });

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

registerTaskUpdateHandlers(prisma, worker, queueId);

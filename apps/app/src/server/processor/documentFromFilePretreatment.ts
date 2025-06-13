import { Prisma, prisma } from "@cat/db";
import type { TextVectorizer, TranslatableFileHandler } from "@cat/plugin-core";
import type {
  Document,
  File,
  JSONType,
  UnvectorizedTextData,
} from "@cat/shared";
import { logger } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { pluginRegistry } from "..";
import { useStorage } from "../utils/storage/useStorage";
import { config } from "./config";
import { diffArrays } from "diff";
import type { InputJsonValue } from "@prisma/client/runtime/client";
import { isEqual } from "lodash-es";

const queueId = "documentFromFilePretreatment";

export const documentFromFilePretreatmentQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const {
      sourceLanguageId,
      file,
      document,
      handlerId,
      vectorizerId,
    }: {
      id: string;
      sourceLanguageId: string;
      file: File;
      document: Document;
      handlerId: string;
      vectorizerId: string;
    } = job.data;

    const handler = pluginRegistry
      .getTranslatableFileHandlers()
      .find((handler) => handler.getId() === handlerId);

    if (!handler)
      throw new Error(`Can not find handler by given id: '${handlerId}'`);

    const vectorizer = pluginRegistry
      .getTextVectorizers()
      .find((vectorizer) => vectorizer.getId() === vectorizerId);

    if (!vectorizer)
      throw new Error(`Can not find vectorizer by given id: '${vectorizerId}'`);

    await processPretreatment(
      sourceLanguageId,
      file,
      document,
      handler,
      vectorizer,
    );
  },
  {
    ...config,
    concurrency: 50,
  },
);

worker.on("active", async (job) => {
  const id = job.data.taskId as string;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "processing",
    },
  });

  logger.info("PROCESSER", `Active ${queueId} task: ${id}`);
});

worker.on("completed", async (job) => {
  const id = job.data.taskId as string;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "completed",
    },
  });

  logger.info("PROCESSER", `Completed ${queueId} task: ${id}`);
});

worker.on("failed", async (job) => {
  if (!job) return;

  const id = job.data.taskId as string;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "failed",
    },
  });

  logger.error("PROCESSER", `Failed ${queueId} task: ${id}`, job);
});

export const processPretreatment = async (
  sourceLanguageId: string,
  file: File,
  document: Document,
  handler: TranslatableFileHandler,
  vectorizer: TextVectorizer,
) => {
  const {
    storage: { getContent },
  } = await useStorage();

  const fileContent = await getContent(file);

  const newElements = handler.extractElement(file, fileContent);

  const addedElements: (UnvectorizedTextData & { documentId: string })[] = [];
  const removedElements: UnvectorizedTextData[] = [];

  // need diff
  const oldElements = (
    await prisma.translatableElement.findMany({
      where: {
        documentId: document.id,
      },
    })
  ).map((element) => ({
    value: element.value,
    meta: element.meta,
  }));

  const result = diffArrays(oldElements, newElements, {
    comparator: (a, b) => a.value === b.value && isEqual(a.meta, b.meta),
  });

  result.forEach((object) => {
    if (object.added) {
      addedElements.push(
        ...object.value.map((element) => ({
          value: element.value,
          meta: element.meta as JSONType,
          documentId: document.id,
        })),
      );
    } else if (object.removed) {
      removedElements.push(...(object.value as UnvectorizedTextData[]));
    }
  });

  try {
    await deleteRemovedTranslatableElements(document.id, removedElements);
    await insertNewTranslatableElement(
      vectorizer,
      sourceLanguageId,
      addedElements,
    );
  } catch (e) {
    logger.error("PROCESSER", "Error when document pretreatment", e);
    throw e;
  }
};

const insertNewTranslatableElement = async (
  vectorizer: TextVectorizer,
  sourceLanguageId: string,
  elements: (UnvectorizedTextData & { documentId: string })[],
) => {
  const vectors =
    (await vectorizer.vectorize(sourceLanguageId, elements)) ?? [];

  if (!vectors) return;

  try {
    await prisma.$transaction(async (tx) => {
      // 批量插入所有向量数据
      const vectorLis = vectors
        .map((vector) => `('[${vector.join(",")}]')`)
        .join(",");
      const vectorInsertResult = await tx.$queryRawUnsafe<{ id: number }[]>(`
      INSERT INTO "Vector" (vector)
      VALUES ${vectorLis}
      RETURNING id
    `);

      // 准备可翻译元素数据（与向量 ID 关联）
      const translatableValues = elements.map(
        (element, index) =>
          Prisma.sql`(
        ${element.value}::text, 
        ${element.meta}::jsonb,
        ${element.documentId}::text, 
        ${vectorInsertResult[index].id}::int
      )`,
      );

      // 批量插入所有可翻译元素
      await tx.$executeRaw`
      INSERT INTO "TranslatableElement" 
        (value, meta, "documentId", "embeddingId")
      VALUES ${Prisma.join(translatableValues, ",")}
    `;
    });
  } catch (e) {
    logger.error(
      "PROCESSER",
      "Error when insert vector and element to database",
      e,
    );
    throw e;
  }
};

// TODO 历史
const deleteRemovedTranslatableElements = async (
  documentId: string,
  elements: UnvectorizedTextData[],
) => {
  await prisma.$transaction(async (tx) => {
    await Promise.all(
      elements.map(async ({ value, meta }) => {
        await tx.translatableElement.delete({
          where: {
            value_meta_documentId: {
              value,
              meta: meta as InputJsonValue,
              documentId,
            },
          },
        });
      }),
    );
  });
};

export const documentFromFilePretreatmentWorker = worker;

import { prisma } from "@cat/db";
import {
  PluginRegistry,
  type TextVectorizer,
  type TranslatableFileHandler,
} from "@cat/plugin-core";
import type {
  Document,
  File,
  JSONType,
  UnvectorizedTextData,
} from "@cat/shared";
import { logger } from "@cat/shared";
import type { InputJsonValue } from "@prisma/client/runtime/client";
import { Queue, Worker } from "bullmq";
import { diffArrays } from "diff";
import { isEqual } from "lodash-es";
import { useStorage } from "../utils/storage/useStorage";
import { config } from "./config";

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

    const pluginRegistry = new PluginRegistry();

    await pluginRegistry.loadPlugins({
      silent: true,
      tags: ["translatable-file-handler", "text-vectorizer"],
    });

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

  const oldElements = (
    await prisma.translatableElement.findMany({
      where: {
        documentId: document.id,
        isActive: true,
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

  const vectors = await vectorizer.vectorize(sourceLanguageId, addedElements);
  if (!vectors) return;

  await prisma.$transaction(async (tx) => {
    const documentVersion = await tx.documentVersion.findFirst({
      where: {
        documentId: document.id,
        isActive: true,
      },
    });

    if (!documentVersion)
      throw new Error("Document do not have any active version. This is a bug");

    // 将旧元素（变化的活跃元素）置为非活跃
    await Promise.all(
      removedElements.map(async ({ meta }) => {
        // 逻辑上应该只能更新到一个元素
        const result = await tx.translatableElement.updateManyAndReturn({
          where: {
            meta: {
              equals: meta as InputJsonValue,
            },
            documentId: document.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
        if (result.length > 1)
          throw new Error("Assert failed. Should update only one element");
      }),
    );

    // 插入变化后的元素
    if (addedElements.length > 0) {
      const vectorInsertResult = await tx.$queryRawUnsafe<{ id: number }[]>(`
        INSERT INTO "Vector" (vector)
        VALUES ${vectors.map((v) => `('[${v.join(",")}]')`).join(",")}
        RETURNING id
      `);

      for (let i = 0; i < addedElements.length; i++) {
        const element = addedElements[i];

        const existing = await tx.translatableElement.findFirst({
          where: {
            documentId: element.documentId,
            meta: {
              equals: element.meta as InputJsonValue,
            },
            isActive: false,
          },
          orderBy: {
            updatedAt: "desc",
          },
        });

        const newVersion = existing ? existing.version + 1 : 1;

        await tx.translatableElement.create({
          data: {
            value: element.value,
            meta: element.meta as InputJsonValue,
            documentId: element.documentId,
            embeddingId: vectorInsertResult[i].id,
            version: newVersion,
            previousVersionId: existing?.id ?? null,
            isActive: true,
            documentVersionId: documentVersion.id,
          },
        });
      }
    }
  });
};

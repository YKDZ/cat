import { Prisma, prisma } from "@cat/db";
import {
  PluginRegistry,
  TextVectorizer,
  TranslatableFileHandler,
} from "@cat/plugin-core";
import {
  Document,
  File,
  logger,
  UnvectorizedTextDataSchema,
} from "@cat/shared";
import { z } from "zod/v4";
import { Queue, Worker } from "bullmq";
import { config } from "./config";
import { useStorage } from "../utils/storage/useStorage";

const queueId = "documentFromFilePretreatment";

export const documentFromFilePretreatmentQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const {
      sourceLanguageId,
      parsedFile,
      parsedDocument,
      handlerId,
      vectorizerId,
    }: {
      id: string;
      sourceLanguageId: string;
      parsedFile: File;
      parsedDocument: Document;
      handlerId: string;
      vectorizerId: string;
    } = job.data;

    console.log(
      PluginRegistry.getInstance().getTranslatableFileHandlers()[0].getId(),
    );

    const handler = PluginRegistry.getInstance()
      .getTranslatableFileHandlers()
      .find((handler) => handler.getId() === handlerId);

    if (!handler)
      throw new Error(`Can not find handler by given id: '${handlerId}'`);

    const vectorizer = PluginRegistry.getInstance()
      .getTextVectorizers()
      .find((vectorizer) => vectorizer.getId() === vectorizerId);

    if (!vectorizer)
      throw new Error(`Can not find vectorizer by given id: '${vectorizerId}'`);

    await processPretreatment(
      sourceLanguageId,
      parsedFile,
      parsedDocument,
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
  await prisma.task.update({
    where: {
      id: job.data.taskId as string,
    },
    data: {
      status: "processing",
    },
  });
});

worker.on("completed", async (job) => {
  await prisma.task.update({
    where: {
      id: job.data.taskId as string,
    },
    data: {
      status: "completed",
    },
  });
});

worker.on("failed", async (job) => {
  if (!job) return;
  await prisma.task.update({
    where: {
      id: job.data.taskId as string,
    },
    data: {
      status: "failed",
    },
  });
});

export const processPretreatment = async (
  sourceLanguageId: string,
  parsedFile: File,
  parsedDocument: Document,
  handler: TranslatableFileHandler,
  vectorizer: TextVectorizer,
) => {
  const {
    storage: { getTextContent },
  } = useStorage();

  const fileContent = await getTextContent(parsedFile);

  const elements = handler
    .extractElement(parsedFile, fileContent)
    .map((element) => {
      return {
        value: element.value,
        documentId: parsedDocument.id,
        meta: element.meta,
      };
    });

  const vectors =
    (await vectorizer.vectorize(
      sourceLanguageId,
      z.array(UnvectorizedTextDataSchema).parse(elements),
    )) ?? [];

  if (!vectors) return;

  try {
    await prisma.$transaction(async (tx) => {
      // 批量插入所有向量数据
      const vectorInsertResult = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO "Vector" (vector)
        VALUES ${Prisma.join(vectors.map((v) => Prisma.sql`(${v}::vector)`))}
        RETURNING id
      `;

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

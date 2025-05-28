import { prisma } from "@cat/db";
import {
  TextVectorizer,
  TextVectorizerRegistry,
  TranslatableFileHandler,
  TranslatableFileHandlerRegistry,
} from "@cat/plugin-core";
import { Document, File, UnvectorizedTextDataSchema } from "@cat/shared";
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

    const handler = TranslatableFileHandlerRegistry.getInstance()
      .getHandlers()
      .find((handler) => handler.getId() === handlerId);
    const vectorizer = TextVectorizerRegistry.getInstance()
      .getVectorizers()
      .find((vectorizer) => vectorizer.getId() === vectorizerId);

    if (!handler || !vectorizer)
      throw new Error("Can not find handler or vectorizer by given id");

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

  await prisma.$transaction(async (tx) => {
    for (const [index, element] of elements.entries()) {
      const vectorId = (
        await tx.$queryRaw<
          {
            id: number;
          }[]
        >`
        INSERT INTO "Vector" (vector)
        VALUES (${vectors[index]}::vector)
        RETURNING id
      `
      )[0].id;
      await tx.$executeRaw`
        INSERT INTO "TranslatableElement" 
          (value, meta, "documentId", "embeddingId")
        VALUES 
          (${element.value}::text, ${element.meta}::jsonb, ${element.documentId}::text, ${vectorId}::int)
      `;
    }
  });
};

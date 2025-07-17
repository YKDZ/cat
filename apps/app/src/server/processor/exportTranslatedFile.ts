import { prisma, setting } from "@cat/db";
import { logger, TranslationSchema, useStringTemplate } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { randomUUID } from "crypto";
import { join } from "path";
import { z } from "zod";
import { useStorage } from "../utils/storage/useStorage";
import { config } from "./config";
import { PluginRegistry } from "@cat/plugin-core";

const queueId = "exportTranslatedFile";

export const exportTranslatedFileQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { taskId, handlerId, documentId, languageId } = job.data as {
      taskId: string;
      handlerId: string;
      documentId: string;
      languageId: string;
    };

    const pluginRegistry = new PluginRegistry();

    await pluginRegistry.loadPlugins({
      silent: true,
      tags: ["translatable-file-handler"],
    });

    const handler = pluginRegistry
      .getTranslatableFileHandlers()
      .find((handler) => handler.getId() === handlerId);

    if (!handler)
      throw new Error(
        `Translatable File Handler with id ${handlerId} do not exists`,
      );

    const document = await prisma.document.findUnique({
      where: {
        id: documentId,
      },
      include: {
        File: {
          include: {
            Type: true,
          },
        },
      },
    });

    if (!document || !document.File)
      throw new Error(`Document with id ${documentId} do not exists`);

    if (!handler.canGenerateTranslated(document.File))
      throw new Error(
        `Translatable File Handler with id ${handlerId} can not generate translated file`,
      );

    const { storage, type } = await useStorage();
    const fileContent = await storage.getContent(document.File);

    const translations = z.array(TranslationSchema).parse(
      await prisma.translation.findMany({
        where: {
          languageId,
          TranslatableElement: {
            documentId,
          },
          Approvments: {
            some: {
              isActive: true,
            },
          },
        },
        include: {
          TranslatableElement: true,
        },
      }),
    );

    const translated = await handler.generateTranslated(
      document.File,
      fileContent,
      translations,
    );

    const fileName = document.File.originName;
    const uuid = randomUUID();
    const date = new Date();
    const template = await setting(
      "storage.template.exported-tranlated-file",
      "exported/document/translated/{year}/{month}/{date}/{uuid}-{languageId}-{fileName}",
    );
    const path = useStringTemplate(template, {
      date,
      documentId,
      languageId,
      uuid,
      fileName,
    });
    const storedPath = join(storage.getBasicPath(), path);

    const file = await prisma.file.create({
      data: {
        storedPath,
        originName: fileName,
        createdAt: date,
        updatedAt: date,
        Type: {
          connect: {
            mimeType: document.File.Type.mimeType,
          },
        },
        StorageType: {
          connect: {
            name: type,
          },
        },
      },
    });

    const uploadURL = await storage.generateUploadURL(storedPath, 60);

    const response = await fetch(uploadURL, {
      method: "PUT",
      headers: {
        "Content-Type": document.File.Type.mimeType,
      },
      body: new Uint8Array(translated),
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(
        `Upload translated file failed: ${response.status} ${response.statusText}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: {
          id: taskId,
        },
      });

      if (!task) throw new Error("Task do not exists");

      if (typeof task.meta !== "object") throw new Error("Task has wrong meta");

      await tx.task.update({
        where: {
          id: job.data.taskId,
        },
        data: {
          meta: {
            ...task.meta,
            fileId: file.id,
          },
        },
      });
    });
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
      id: job.data.taskId as string,
    },
    data: {
      status: "failed",
    },
  });

  logger.error("PROCESSER", `Failed ${queueId} task: ${id}`, job.stacktrace);
});

export const exportTranslatedFileWorker = worker;

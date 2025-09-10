import { mimeFromFileName, setting } from "@cat/db";
import { useStringTemplate } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { randomUUID } from "crypto";
import { join } from "path";
import { z } from "zod";
import { useStorage } from "@/server/utils/storage/useStorage";
import { config } from "./config";
import { PluginRegistry } from "@cat/plugin-core";
import { getPrismaDB } from "@cat/db";
import { registerTaskUpdateHandlers } from "@/server/utils/worker";

const { client: prisma } = await getPrismaDB();

const queueId = "exportTranslatedFile";

export const exportTranslatedFileQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { handlerId, documentId, languageId } = job.data as {
      handlerId: string;
      documentId: string;
      languageId: string;
    };
    const taskId = job.name;

    const pluginRegistry = new PluginRegistry();

    await pluginRegistry.loadPlugins(prisma, {
      silent: true,
      tags: ["translatable-file-handler"],
    });

    const handler = (await pluginRegistry.getTranslatableFileHandlers(prisma))
      .map((d) => d.handler)
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
        File: true,
      },
    });

    if (!document || !document.File)
      throw new Error(`Document with id ${documentId} do not exists`);

    const { id, provider } = await useStorage(prisma, "S3", "GLOBAL", "");
    const fileContent = await provider.getContent(document.File);

    const translationData = await prisma.translation.findMany({
      where: {
        languageId,
        TranslatableElement: {
          documentId,
        },
        Approvements: {
          some: {
            isActive: true,
          },
        },
      },
      select: {
        value: true,
        TranslatableElement: {
          select: {
            meta: true,
          },
        },
      },
    });

    const translated = await handler.getReplacedFileContent(
      document.File,
      fileContent,
      translationData.map(({ value, TranslatableElement: { meta } }) => ({
        value,
        meta: z.json().parse(meta),
      })),
    );

    const fileName = document.File.originName;
    const uuid = randomUUID();
    const date = new Date();
    const template = await setting(
      "storage.template.exported-translated-file",
      "exported/document/translated/{year}/{month}/{date}/{uuid}-{languageId}-{fileName}",
      prisma,
    );
    const path = useStringTemplate(template, {
      date,
      documentId,
      languageId,
      uuid,
      fileName,
    });
    const storedPath = join(provider.getBasicPath(), path);

    const file = await prisma.file.create({
      data: {
        storedPath,
        originName: fileName,
        createdAt: date,
        updatedAt: date,
        storageProviderId: id,
      },
    });

    const uploadURL = await provider.generateUploadURL(storedPath, 60);

    const response = await fetch(uploadURL, {
      method: "PUT",
      headers: {
        "Content-Type": await mimeFromFileName(fileName, prisma),
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
          id: taskId,
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

registerTaskUpdateHandlers(prisma, worker, queueId);

export const exportTranslatedFileWorker = worker;

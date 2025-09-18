import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Queue, Worker } from "bullmq";
import { mimeFromFileName, setting } from "@cat/db";
import * as z from "zod/v4";
import { PluginRegistry } from "@cat/plugin-core";
import { getPrismaDB } from "@cat/db";
import { useStringTemplate } from "@cat/shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/server/utils/worker.ts";
import { useStorage } from "@/server/utils/storage/useStorage.ts";

const { client: prisma } = await getPrismaDB();

const queueId = "exportTranslatedFile";

export const exportTranslatedFileQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { documentId, languageId } = z
      .object({
        documentId: z.string(),
        languageId: z.string(),
      })
      .parse(job.data);
    const taskId = job.id;
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const document = await prisma.document.findUnique({
      where: {
        id: documentId,
      },
      select: {
        File: true,
        FileHandler: {
          select: {
            serviceId: true,
            PluginInstallation: {
              select: {
                pluginId: true,
              },
            },
          },
        },
      },
    });

    if (!document) throw new Error("Document not found");

    if (!document.File || !document.FileHandler)
      throw new Error("File not found");

    const { service: handler } = (await pluginRegistry.getPluginService(
      prisma,
      document.FileHandler.PluginInstallation.pluginId,
      "TRANSLATABLE_FILE_HANDLER",
      document.FileHandler.serviceId,
    ))!;

    if (!handler)
      throw new Error(
        `Translatable File Handler with id ${document.FileHandler.serviceId} do not exists`,
      );

    if (!document || !document.File)
      throw new Error(`Document with id ${documentId} do not exists`);

    const { id, provider } = await useStorage(
      prisma,
      "s3-storage-provider",
      "S3",
      "GLOBAL",
      "",
    );
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

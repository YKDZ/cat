import { prisma } from "@cat/db";
import { Queue, Worker } from "bullmq";
import { config } from "./config";
import { logger } from "@cat/shared";
import { PluginImporterRegistry } from "../utils/plugin/plugin-importer-registry";

const queueId = "importPlugin";

export const importPluginQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const {
      origin,
    }: {
      origin: Record<string, unknown>;
    } = job.data;

    const handler = PluginImporterRegistry.getInstance()
      .getHandlers()
      .find((handler) => handler.canImportPlugin(origin));

    if (!handler)
      throw new Error("Can not find handler by given origin: " + origin);

    // 开始导入插件
    const data = await handler.importPlugin(origin);

    await prisma.$transaction(async (tx) => {
      const originPlugin = await tx.plugin.findUnique({
        where: {
          id: data.id,
        },
      });

      const id = originPlugin?.id ?? "PLUGIN_NOT_EXISTS";

      await tx.plugin.upsert({
        where: {
          id,
        },
        update: {
          name: data.name,
          overview: data.overview,
          iconURL: data.iconURL,
          Versions: {
            create: {
              version: data.version,
            },
          },
        },
        create: {
          id: data.id,
          origin: origin as never,
          name: data.name,
          overview: data.overview,
          entry: data.entry,
          iconURL: data.iconURL,
          Versions: {
            create: {
              version: data.version,
            },
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

  logger.info("PROCESSER", `Active import_plugin task: ${id}`);
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

  logger.info("PROCESSER", `Completed import_plugin task: ${id}`);
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

  logger.error("PROCESSER", `Failed import_plugin task: ${id}`, job);
});

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

      const pluginId = originPlugin?.id ?? data.id;

      await tx.plugin.upsert({
        where: {
          // 不存在原插件意味着即将创建
          id: pluginId,
        },
        update: {
          name: data.name,
          overview: data.overview,
          iconURL: data.iconURL,
          Configs: {
            connectOrCreate: data.configs
              ? data.configs.map(({ key, schema }) => ({
                  where: {
                    pluginId_key: {
                      pluginId,
                      key,
                    },
                  },
                  create: {
                    key,
                    schema,
                    value: getDefaultFromSchema(schema),
                  },
                }))
              : [],
          },
          Tags: {
            connectOrCreate: data.tags
              ? data.tags.map((tag) => ({
                  where: {
                    name: tag,
                  },
                  create: {
                    name: tag,
                  },
                }))
              : undefined,
          },
          Versions: {
            connectOrCreate: {
              where: {
                pluginId_version: {
                  pluginId,
                  version: data.version,
                },
              },
              create: {
                version: data.version,
              },
            },
          },
        },
        create: {
          id: pluginId,
          origin,
          name: data.name,
          overview: data.overview,
          entry: data.entry,
          iconURL: data.iconURL,
          Configs: {
            connectOrCreate: data.configs
              ? data.configs.map(({ key, schema }) => ({
                  where: {
                    pluginId_key: {
                      pluginId,
                      key,
                    },
                  },
                  create: {
                    key,
                    schema,
                    value: getDefaultFromSchema(schema),
                  },
                }))
              : [],
          },
          Tags: {
            connectOrCreate: data.tags
              ? data.tags.map((tag) => ({
                  where: {
                    name: tag,
                  },
                  create: {
                    name: tag,
                  },
                }))
              : undefined,
          },
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

export const importPluginWorker = worker;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDefaultFromSchema = (schema: any): any => {
  if (schema.default !== undefined) {
    return schema.default;
  }

  if (schema.type === "object" || schema.properties) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: Record<string, any> = {};
    const properties = schema.properties || {};

    for (const [key, propSchema] of Object.entries(properties)) {
      const value = getDefaultFromSchema(propSchema);
      if (value !== undefined) {
        obj[key] = value;
      }
    }
    return Object.keys(obj).length > 0 ? obj : undefined;
  }

  if (schema.type === "array" || schema.items) {
    if (schema.default !== undefined) return schema.default;

    const itemsSchema = schema.items;
    if (Array.isArray(itemsSchema)) {
      const arr = itemsSchema
        .map((item) => getDefaultFromSchema(item))
        .filter((val) => val !== undefined);
      return arr.length > 0 ? arr : undefined;
    } else if (itemsSchema) {
      const itemDefault = getDefaultFromSchema(itemsSchema);
      return itemDefault !== undefined ? [itemDefault] : undefined;
    }
    return undefined;
  }

  if (schema.oneOf || schema.anyOf) {
    const candidates = schema.oneOf || schema.anyOf;
    for (const candidate of candidates) {
      const result = getDefaultFromSchema(candidate);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  if (schema.if && schema.then) {
    const ifResult = getDefaultFromSchema(schema.if);
    if (ifResult !== undefined) {
      const thenResult = getDefaultFromSchema(schema.then);
      if (thenResult !== undefined) return thenResult;
    }
    if (schema.else) {
      return getDefaultFromSchema(schema.else);
    }
  }

  return {};
};

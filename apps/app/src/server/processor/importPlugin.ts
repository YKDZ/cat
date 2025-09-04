import { Queue, QueueEvents, Worker } from "bullmq";
import { config } from "./config";
import { PluginImporterRegistry } from "../utils/plugin/plugin-importer-registry";
import { getPrismaDB } from "@cat/db";
import { registerTaskUpdateHandlers } from "../utils/worker";
import z from "zod";

const { client: prisma } = await getPrismaDB();

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

      // 不存在原插件意味着即将创建
      const pluginId = originPlugin?.id ?? data.id;

      await tx.plugin.upsert({
        where: {
          id: pluginId,
        },
        update: {
          name: data.name,
          entry: data.entry ?? null,
          overview: data.overview,
          iconURL: data.iconURL,
          Configs: {
            connectOrCreate: data.configs
              ? data.configs.map(({ key, schema, overridable }) => ({
                  where: {
                    pluginId_key: {
                      pluginId,
                      key,
                    },
                  },
                  create: {
                    key,
                    schema: schema ?? {},
                    overridable,
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
          Components: {
            connectOrCreate: data.components
              ? data.components.map((component) => ({
                  where: {
                    id_pluginId: {
                      id: component.id,
                      pluginId,
                    },
                  },
                  create: {
                    id: component.id,
                    entry: component.entry,
                    mountOn: component.mountOn,
                  },
                }))
              : undefined,
          },
        },
        create: {
          id: pluginId,
          origin: z.json().parse(origin) ?? {},
          name: data.name,
          overview: data.overview,
          entry: data.entry ?? null,
          iconURL: data.iconURL,
          Configs: {
            connectOrCreate: data.configs
              ? data.configs.map(({ key, schema, overridable }) => ({
                  where: {
                    pluginId_key: {
                      pluginId,
                      key,
                    },
                  },
                  create: {
                    key,
                    schema: schema ?? {},
                    overridable,
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
          Components: {
            connectOrCreate: data.components
              ? data.components.map((component) => ({
                  where: {
                    id_pluginId: {
                      id: component.id,
                      pluginId,
                    },
                  },
                  create: {
                    id: component.id,
                    entry: component.entry,
                    mountOn: component.mountOn,
                  },
                }))
              : undefined,
          },
        },
      });
    });
  },
  {
    ...config,
    concurrency: 1,
  },
);

registerTaskUpdateHandlers(prisma, worker, queueId);

export const importPluginWorker = worker;

export const importPluginQueueEvents = new QueueEvents(queueId);

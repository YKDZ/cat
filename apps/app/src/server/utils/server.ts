import { ESDB, prisma, PrismaDB, RedisDB, S3DB, setting } from "@cat/db";
import { logger, SettingSchema } from "@cat/shared";
import type { Server } from "http";
import type z from "zod/v4";
import { closeAllProcessors } from "../processor";
import { initESIndex } from "./es";
import { PluginRegistry } from "@cat/plugin-core";
import {
  importPluginQueue,
  importPluginQueueEvents,
} from "../processor/importPlugin";
import { useStorage } from "./storage/useStorage";
import type { Job } from "bullmq";

export const shutdownServer = async (server: Server) => {
  logger.info("SERVER", "About to shutdown server gracefully...");

  await new Promise<void>((resolve, reject) => {
    server.close(async (err) => {
      if (err) reject(err);
      else resolve();

      await closeAllProcessors();

      await PrismaDB.disconnect();
      await RedisDB.disconnect();
      await ESDB.disconnect();
      await (await useStorage()).storage.disconnect();
    });
  });

  logger.info("SERVER", "Successfully shutdown gracefully. Goodbye");
};

export const initDB = async () => {
  try {
    await PrismaDB.connect();
    await RedisDB.connect();
    await ESDB.connect();
    await (await useStorage()).storage.connect();

    logger.info("DB", "Successfully connect to all database.");

    await PrismaDB.ping();
    await RedisDB.ping();
    await ESDB.ping();
    await (await useStorage()).storage.ping();

    logger.info("DB", "All database is health.");

    await initESIndex();
  } catch (e) {
    logger.error(
      "DB",
      "Database init failed. CAT process will exit with code 1 now.",
      e,
    );
    process.exit(1);
  }
};

const settings: SettingData[] = [
  {
    key: "s3.region",
    value: "cn-south-1",
  },
  {
    key: "s3.access-key-id",
    value: "your key id",
  },
  {
    key: "s3.secret-access-key",
    value: "your key",
  },
  {
    key: "s3.bucket-name",
    value: "cat",
  },
  {
    key: "s3.endpoint-url",
    value: "http://localhost:9001",
  },
  {
    key: "s3.force-path-style",
    value: true,
  },
  {
    key: "server.storage-type",
    value: "LOCAL",
  },
  {
    key: "server.url",
    value: "http://localhost:3000",
  },
  {
    key: "server.name",
    value: "CAT",
  },
];

const SettingDataSchema = SettingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
type SettingData = z.infer<typeof SettingDataSchema>;

export const initSettings = async () => {
  await prisma.$transaction(async (tx) => {
    await Promise.all(
      settings
        .map((setting) => SettingDataSchema.parse(setting))
        .map(async ({ key, value }) => {
          const current = await tx.setting.findUnique({
            where: {
              key,
            },
          });

          if (current) return;

          await tx.setting.create({
            data: {
              key,
              value,
            },
          });
        }),
    );
  });
};

export const scanLocalPlugins = async () => {
  const existPluginIds: string[] = [];
  const jobs: Job[] = [];

  await prisma.$transaction(async (tx) => {
    existPluginIds.push(
      ...(
        await tx.plugin.findMany({
          select: {
            id: true,
          },
        })
      ).map((plugin) => plugin.id),
    );

    await Promise.all(
      (await PluginRegistry.getInstance().getPluginIdInLocalPlugins())
        .filter((id) => !existPluginIds.includes(id))
        .map(async (id) => {
          const task = await tx.task.create({
            data: {
              type: "import_plugin",
            },
          });

          jobs.push(
            await importPluginQueue.add(task.id, {
              taskId: task.id,
              origin: {
                type: "LOCAL",
                data: {
                  id,
                },
              },
            }),
          );
        }),
    );
  });

  if (existPluginIds.length === 0) {
    await importPluginQueueEvents.waitUntilReady();

    await Promise.all(
      jobs.map(
        async (job) => await job.waitUntilFinished(importPluginQueueEvents),
      ),
    );

    await PluginRegistry.getInstance().reload();
    logger.info(
      "SERVER",
      "Reloaded plugins successfully for there was no plugins registered in the database before",
    );
  }
};

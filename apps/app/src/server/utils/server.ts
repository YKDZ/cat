import type { PrismaClient } from "@cat/db";
import { ESDB, PrismaDB, RedisDB } from "@cat/db";
import { logger, SettingSchema } from "@cat/shared";
import type { Job } from "bullmq";
import type { Server } from "http";
import type z from "zod";
import getPluginRegistry from "../pluginRegistry";
import { closeAllProcessors } from "../processor";
import {
  importPluginQueue,
  importPluginQueueEvents,
} from "../processor/importPlugin";
import { EsTermStore } from "./es";
import { useStorage } from "./storage/useStorage";

export const shutdownServer = async (server: Server) => {
  logger.info("SERVER", "About to shutdown server gracefully...");

  await new Promise<void>((resolve, reject) => {
    server.close(async (err) => {
      if (err) reject(err);
      else resolve();

      await closeAllProcessors();

      await (await useStorage()).storage.disconnect();
    });
  });

  logger.info("SERVER", "Successfully shutdown gracefully. Goodbye");
};

export const initPrismaDB = async () => {
  try {
    const db = new PrismaDB();
    await db.connect();
    await db.ping();
    logger.info("DB", "Successfully connected to PrismaDB.");
    return db;
  } catch (e) {
    logger.error("DB", "Failed to connect to PrismaDB.", e);
    throw e;
  }
};

export const initRedisDB = async () => {
  try {
    await RedisDB.connect();
    await RedisDB.ping();
    logger.info("DB", "Successfully connected to RedisDB.");
    return RedisDB;
  } catch (e) {
    logger.error("DB", "Failed to connect to RedisDB.", e);
    throw e;
  }
};

export const initESDB = async () => {
  try {
    const db = new ESDB();
    await ESDB.connect();
    await ESDB.ping();
    logger.info("DB", "Successfully connected to ESDB.");
    return;
  } catch (e) {
    logger.error("DB", "Failed to connect to ESDB.", e);
    throw e;
  }
};

export const scanLocalPlugins = async (prisma: PrismaClient) => {
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
      (await (await getPluginRegistry()).getPluginIdInLocalPlugins())
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

    (await getPluginRegistry()).reload();
    logger.info(
      "SERVER",
      "Reloaded plugins successfully for there was no plugins registered in the database before",
    );
  }
};

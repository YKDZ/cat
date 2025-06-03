import { ESDB, PrismaDB, RedisDB, S3DB } from "@cat/db";
import { logger } from "@cat/shared";
import { Server } from "http";
import { closeAllProcessors } from "../processor";
import { initESIndex } from "./es";
import { useStorage } from "./storage/useStorage";

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
    });
  });

  logger.info("SERVER", "Successfully shutdown gracefully. Goodbye");
};

export const initDB = async () => {
  try {
    await PrismaDB.connect();
    await RedisDB.connect();
    await ESDB.connect();

    const { type } = await useStorage();
    if (type === "S3") await S3DB.connect();

    logger.info("DB", "Successfully connect to all database.");

    await PrismaDB.ping();
    await RedisDB.ping();
    await ESDB.ping();
    if (type === "S3") await S3DB.ping();

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

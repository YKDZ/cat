import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { es, ESDB, prisma, PrismaDB, redis, RedisDB, S3DB } from "@cat/db";
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
    const { type: storageType } = useStorage();

    await PrismaDB.connect();
    await RedisDB.connect();
    await ESDB.connect();
    if (storageType === "S3") await S3DB.connect();

    logger.info("DB", "Successfully connect to all database.");

    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    await es.ping();
    if (storageType === "S3")
      await S3DB.client.send(
        new HeadBucketCommand({
          Bucket: process.env.S3_UPLOAD_BUCKET_NAME ?? "cat",
        }),
      );

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

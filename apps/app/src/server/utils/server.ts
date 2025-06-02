import { es, ESDB, prisma, PrismaDB, redis, RedisDB, s3, S3DB } from "@cat/db";
import { useStorage } from "./storage/useStorage";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { logger } from "@cat/shared";
import { initIndex } from "./es";
import { Server } from "http";
import { documentFromFilePretreatmentWorker } from "../processor/documentFromFilePretreatment";
import { importPluginWorker } from "../processor/importPlugin";
import { closeAllProcessors } from "../processor";

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

    logger.info("DB", "Successfully connect to database.");

    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    await es.ping();
    if (storageType === "S3")
      await s3.send(
        new HeadBucketCommand({
          Bucket: process.env.S3_UPLOAD_BUCKET_NAME ?? "cat",
        }),
      );

    logger.info("DB", "All database is health.");

    await initIndex();

    logger.info("DB", "Successfully init es index");
  } catch (e) {
    logger.error(
      "DB",
      "Database init failed. CAT process will exit with code 1 now.",
      e,
    );
    process.exit(1);
  }
};

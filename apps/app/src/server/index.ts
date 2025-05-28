import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import app from "./app";
import { userFromSessionId } from "./utils/user";
import { getCookieFunc } from "./utils/cookie";
import "dotenv/config";
import { PluginRegistry } from "@cat/plugin-core";
import { es, ESDB, prisma, PrismaDB, redis, RedisDB, s3, S3DB } from "@cat/db";
import { useStorage } from "./utils/storage/useStorage";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { logger } from "@cat/shared";

const initDB = async () => {
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

    await PluginRegistry.getInstance().loadPlugins();
  } catch (e) {
    logger.error(
      "DB",
      "Database init failed. CAT process will exit with code 1 now.",
      e,
    );
    process.exit(1);
  }
};

function startServer() {
  const port = import.meta.env.PORT ? parseInt(import.meta.env.PORT) : 3000;

  apply(app, {
    pageContext: async (runtime) => {
      const cookie = runtime.req?.headers["cookie"] ?? "";
      const sessionId = getCookieFunc(cookie)("sessionId");
      const user = await userFromSessionId(sessionId ?? "");
      return {
        user,
        sessionId,
      };
    },
  });

  return serve(app, {
    port,
    hostname: "localhost",
    async onCreate(server) {
      await initDB();
    },
  });
}

export default startServer();

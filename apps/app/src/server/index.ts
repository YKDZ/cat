import "dotenv/config";
import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import app from "./app";
import { getCookieFunc } from "./utils/cookie";
import { userFromSessionId } from "./utils/user";
import { useStorage } from "@/server/utils/storage/useStorage";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { PrismaDB, RedisDB, ESDB, S3DB, prisma, redis, es, s3 } from "@cat/db";
import { logger } from "@cat/shared";
import { PluginRegistry } from "@cat/plugin-core";

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
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  apply(app, {
    pageContext: async (runtime) => {
      const cookie = runtime.req?.headers["cookie"] ?? "";
      const sessionId = getCookieFunc(cookie)("sessionId");
      const user = await userFromSessionId(sessionId ?? "");

      return {
        user,
        sessionId,
        pluginRegistry: PluginRegistry.getInstance(),
      };
    },
  });

  return serve(app, {
    port,
    onCreate: async () => {
      await initDB();
      await PluginRegistry.getInstance().loadPlugins();
    },
  });
}

export default startServer();

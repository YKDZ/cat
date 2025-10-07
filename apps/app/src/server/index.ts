import "dotenv/config";
import type { Server } from "node:http";
import { logger } from "@cat/shared/utils";
import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import { account, getDrizzleDB, getRedisDB, getTableColumns } from "@cat/db";
import { closeAllProcessors } from "@cat/app-workers/utils";
import app from "./app.ts";
import { kill } from "node:process";

let server: Server | null = null;

const shutdownServer = async () => {
  logger.info("SERVER", { msg: "About to shutdown server gracefully..." });

  await new Promise<void>((resolve, reject) => {
    server!.close(async (err) => {
      if (err) reject(err);
      else resolve();

      await closeAllProcessors();
      await (await getRedisDB()).disconnect();
      await (await getDrizzleDB()).disconnect();
    });
  });

  logger.info("SERVER", { msg: "Successfully shutdown gracefully. Goodbye" });
};

const startServer = async () => {
  apply(app);

  const { client: drizzle } = await getDrizzleDB();

  const a = await drizzle
    .select({ ...getTableColumns(account) })
    .from(account)
    .limit(1);

  console.log(typeof a[0]?.updatedAt);

  return serve(app, {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    onCreate: async (nodeServer) => {
      server = nodeServer as Server;

      if (process.env.NODE_ENV === "production") {
        process.on("SIGTERM", shutdownServer);
        process.on("SIGQUIT", shutdownServer);
        process.on("SIGINT", shutdownServer);
      }
    },
  });
};

export default startServer();

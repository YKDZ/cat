import "dotenv/config";
import type { Server } from "node:http";
import { logger } from "@cat/shared/utils";
import { apply, serve } from "@photonjs/hono";
import { getDrizzleDB, getRedisDB } from "@cat/db";
import app from "./app.ts";

let server: Server | null = null;

const shutdownServer = () => {
  const handler = async () => {
    logger.info("SERVER", { msg: "About to shutdown server gracefully..." });

    await new Promise<void>((resolve, reject) => {
      server!.close((err) => {
        if (err) reject(err);

        void (async () => {
          (await getRedisDB()).disconnect();
          await (await getDrizzleDB()).disconnect();
        })();

        resolve();
      });
    });

    logger.info("SERVER", { msg: "Successfully shutdown gracefully. Goodbye" });
  };

  handler().catch((err: unknown) => {
    logger.error(
      "SERVER",
      {
        msg: "Error occurred during server shutdown",
      },
      err,
    );
  });
};

const startServer = async () => {
  apply(app);

  return serve(app, {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    onCreate: (nodeServer) => {
      if (!nodeServer) {
        logger.debug("SERVER", {
          msg: "Failed to create HTTP server. Server will exit with code 1.",
        });
        process.exit(1);
      }

      server = nodeServer;

      if (process.env.NODE_ENV === "production") {
        process.on("SIGTERM", shutdownServer);
        process.on("SIGQUIT", shutdownServer);
        process.on("SIGINT", shutdownServer);
      }
    },
  });
};

export default await startServer();

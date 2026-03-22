import "dotenv/config";
import type { Server } from "node:http";

import app, { wsHelper } from "@cat/app-api/app";
import { getDbHandle, getRedisHandle } from "@cat/domain";
import { serverLogger as logger } from "@cat/server-shared";
import { apply, serve } from "@photonjs/hono";

let server: Server | null = null;

const shutdownServer = () => {
  const handler = async () => {
    logger
      .withSituation("SERVER")
      .info("About to shutdown server gracefully...");

    await new Promise<void>((resolve, reject) => {
      server!.close((err) => {
        if (err) reject(err);

        void (async () => {
          (await getRedisHandle()).disconnect();
          await (await getDbHandle()).disconnect();
        })();

        resolve();
      });
    });

    logger
      .withSituation("SERVER")
      .info("Successfully shutdown gracefully. Goodbye");
  };

  handler().catch((err: unknown) => {
    logger
      .withSituation("SERVER")
      .error(err, "Error occurred during server shutdown");
  });
};

const startServer = () => {
  apply(app);

  return serve(app, {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,

    onCreate: (nodeServer) => {
      if (!nodeServer) {
        logger
          .withSituation("SERVER")
          .error("Failed to create HTTP server. Server will exit with code 1.");
        process.exit(1);
      }

      let rawServer = nodeServer.httpServer || nodeServer;

      if (
        rawServer &&
        // oxlint-disable-next-line no-unsafe-member-access
        !rawServer.on &&
        // oxlint-disable-next-line no-unsafe-member-access
        rawServer.node &&
        // oxlint-disable-next-line no-unsafe-member-access
        rawServer.node.server
      ) {
        // oxlint-disable-next-line no-unsafe-member-access
        rawServer = rawServer.node.server;
      }

      // oxlint-disable-next-line no-unsafe-member-access
      if (rawServer && typeof rawServer.on === "function") {
        // oxlint-disable-next-line no-unsafe-argument
        wsHelper.injectWebSocket(rawServer);
        server = rawServer;
      } else {
        logger
          .withSituation("SERVER")
          .warn(
            "Failed to inject WebSocket: server instance does not support .on() method",
          );
      }

      if (process.env.NODE_ENV === "production") {
        process.on("SIGTERM", shutdownServer);
        process.on("SIGQUIT", shutdownServer);
        process.on("SIGINT", shutdownServer);
      }
    },
  });
};

export default startServer();

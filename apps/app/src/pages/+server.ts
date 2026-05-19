import "dotenv/config";
import type { Server as VikeServer } from "vike/types";

import app, { wsHelper } from "@cat/app-api/app";
import { serverLogger as logger } from "@cat/server-shared";
import vike from "@vikejs/hono";

import { initializeApp } from "@/server/initialize.ts";
import { createShutdownHandler } from "@/server/shutdown.ts";

vike(app);

// Initialize the application before starting the HTTP server.
// This ensures /_health returns 200 only after the server is fully ready,
// decoupling initialization from Vike's onCreateGlobalContext hook (which has
// a 30 s timeout that would fail on cold start).
await initializeApp();

export default {
  prod: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    hostname: process.env.HOST,

    onReady(server) {
      logger.withSituation("SERVER").info(`Server is ready at ${server.url}`);
    },

    onCreate(server) {
      // Inject the underlying Node.js HTTP server into @hono/node-ws so that
      // WebSocket upgrade requests can be handled correctly.
      const nodeServer = server.node?.server;
      if (!nodeServer) {
        logger
          .withSituation("SERVER")
          .error(
            "No Node.js HTTP server found; WebSocket support is required. Process will exit with code 1.",
          );
        process.exit(1);
      }

      wsHelper.injectWebSocket(nodeServer);
      const shutdown = createShutdownHandler(server);

      process.on("SIGTERM", shutdown);
      process.on("SIGQUIT", shutdown);
      process.on("SIGINT", shutdown);
    },
  },

  fetch: app.fetch,
} satisfies VikeServer;

import "dotenv/config";
import http from "node:http";

import app, { injectApplicationWebSocket } from "@cat/app-api/app";
import { serverLogger as logger } from "@cat/server-shared";
import vike from "@vikejs/hono";
import type { Server as VikeServer } from "vike/types";

import { initializeApp } from "#/server/initialize.ts";
import { createShutdownHandler } from "#/server/shutdown.ts";

vike(app);

// Start initialization without delaying HTTP liveness. The app middleware still
// rejects business traffic until readiness reports a fully initialized runtime.
void initializeApp();

const serverConfig: VikeServer = {
  prod: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    ...(process.env.HOST === undefined ? {} : { hostname: process.env.HOST }),

    onReady(server) {
      logger
        .child({ component: "server" })
        .info(`Server is ready at ${server.url}`);
    },

    onCreate(server) {
      // Inject the underlying Node.js HTTP server into @hono/node-ws so that
      // WebSocket upgrade requests can be handled correctly.
      // Narrow to http.Server via instanceof so closeAllConnections is typed.
      // Vike may expose http2.Http2Server too, but this app runs HTTP/1.1 only.
      const rawServer = server.node?.server;
      const nodeServer =
        rawServer instanceof http.Server ? rawServer : undefined;
      if (!nodeServer) {
        logger
          .child({ component: "server" })
          .error(
            "No Node.js HTTP server found; WebSocket support is required. Process will exit with code 1.",
          );
        process.exit(1);
      }

      injectApplicationWebSocket(nodeServer);
      const shutdown = createShutdownHandler(server, nodeServer);

      process.on("SIGTERM", shutdown);
      process.on("SIGQUIT", shutdown);
      process.on("SIGINT", shutdown);
    },
  },

  fetch: app.fetch,
};

export default serverConfig;

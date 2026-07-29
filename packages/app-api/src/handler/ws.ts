import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

import { pinoInstance } from "@cat/server-shared";
import { createNodeWebSocket } from "@hono/node-ws";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { RPCHandler } from "@orpc/server/websocket";
import { Hono } from "hono";

import router from "#/orpc/router.ts";
import { getContext } from "#/utils/index.ts";

const app = new Hono();

export const wsHelper = createNodeWebSocket({ app });

const injectedServers = new WeakSet<Server>();

type UpgradeListener = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

/**
 * Attach the application socket route without consuming unrelated upgrades.
 * Vite shares its development HTTP server with HMR, while @hono/node-ws closes
 * every upgrade it cannot route itself.
 */
export const injectApplicationWebSocket = (server: Server): void => {
  if (injectedServers.has(server)) return;

  const existingListeners = new Set(server.listeners("upgrade"));
  wsHelper.injectWebSocket(server);
  const registeredListener = server
    .listeners("upgrade")
    .find((listener) => !existingListeners.has(listener));
  if (!registeredListener) {
    throw new Error("@hono/node-ws did not register an upgrade listener");
  }
  // Node's EventEmitter erases listener argument types at retrieval time.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const helperListener = registeredListener as UpgradeListener;

  server.removeListener("upgrade", helperListener);
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/api/ws") return;
    helperListener.call(server, request, socket, head);
  });
  injectedServers.add(server);
};

const handler = new RPCHandler(router, {
  plugins: [
    new LoggingHandlerPlugin({
      logger: pinoInstance,
      generateId: () => crypto.randomUUID(),
    }),
  ],
  interceptors: [],
});

app.get(
  "/api/ws",
  wsHelper.upgradeWebSocket(async (c) => {
    const context = await getContext(c.req.raw, c.res.headers);
    // WebSocket 受浏览器同源策略保护，无需 CSRF token 验证
    context.isWebSocket = true;
    const listeners = {
      message: [] as ((event: unknown) => void)[],
      close: [] as ((event: unknown) => void)[],
    };

    return {
      onOpen: (_evt, ws) => {
        // oxlint-disable-next-line no-unsafe-type-assertion
        const standardWs = {
          send: ws.send.bind(ws),
          addEventListener: (
            type: "message" | "close",
            // oxlint-disable-next-line no-explicit-any
            listener: (event: any) => void,
          ) => {
            if (type === "message") {
              listeners.message.push(listener);
            } else if (type === "close") {
              listeners.close.push(listener);
            }
          },
        } as unknown as WebSocket;

        handler.upgrade(standardWs, {
          context,
        });
      },
      onMessage: (event, _ws) => {
        listeners.message.forEach((listener) => {
          listener(event);
        });
      },
      onClose: (event, _ws) => {
        listeners.close.forEach((listener) => {
          listener(event);
        });
      },
    };
  }),
);

export default app;

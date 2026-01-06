import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { RPCHandler } from "@orpc/server/websocket";
import router from "@/orpc/router";
import { getContext } from "@/utils";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { logger } from "@cat/shared/utils";

const app = new Hono();

export const wsHelper = createNodeWebSocket({ app });

const handler = new RPCHandler(router, {
  plugins: [
    new LoggingHandlerPlugin({
      logger: logger.baseLogger,
      generateId: () => crypto.randomUUID(),
    }),
  ],
  interceptors: [],
});

app.get(
  "*",
  wsHelper.upgradeWebSocket(async (c) => {
    const context = await getContext(c.req.raw, c.res.headers);
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

        // oxlint-disable-next-line no-confusing-void-expression no-unsafe-call
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

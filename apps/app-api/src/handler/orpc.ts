import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { logger } from "@cat/shared/utils";
import { Hono } from "hono";
import { getHttpContext } from "@/utils/context";
import { CompressionPlugin } from "@orpc/server/fetch";
import router from "@/orpc/router.ts";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";

const app = new Hono();

const handler = new RPCHandler(router, {
  plugins: [
    new CORSPlugin(),
    new CompressionPlugin(),
    new LoggingHandlerPlugin({
      logger: logger.baseLogger,
      generateId: () => crypto.randomUUID(),
    }),
  ],
  interceptors: [],
});

// @ts-expect-error https://orpc.dev/docs/adapters/hono
app.all("*", async (c, next) => {
  const ctx = await getHttpContext(c.req.raw, c.res.headers);

  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: "/api/rpc",
    context: { ...ctx },
  });

  if (matched) {
    return c.newResponse(response.body, response);
  }

  await next();
});

export const orpcHandler = app;

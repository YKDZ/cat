import { logger } from "@cat/shared/utils";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { RPCHandler } from "@orpc/server/fetch";
import { CompressionPlugin } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { Hono } from "hono";

import router from "@/orpc/router.ts";
import { getContext } from "@/utils/context";

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
  const ctx = await getContext(c.req.raw, c.res.headers);

  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: "/api/rpc",
    context: { ...ctx },
  });

  if (matched) {
    return c.newResponse(response.body, response);
  }

  await next();
});

export default app;

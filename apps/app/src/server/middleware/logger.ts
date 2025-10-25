import { createMiddleware } from "hono/factory";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pinoHttp } from "pino-http";

export const pinoLoggerMiddleware = createMiddleware(async (c, next) => {
  type Env = {
    incoming: IncomingMessage;
    outgoing: ServerResponse<IncomingMessage>;
  };

  // oxlint-disable-next-line no-unsafe-type-assertion
  const env = c.env as Env;

  env.incoming.id = c.var.requestId;

  if (process.env.NODE_ENV === "production") {
    await new Promise<void>((resolve) => {
      pinoHttp({
        level: "debug",
        quietResLogger: true,
        quietReqLogger: true,
      })(env.incoming, env.outgoing, () => {
        resolve();
      });
    });
  }

  c.set("logger", env.incoming.log);

  await next();
});

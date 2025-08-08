import { createMiddleware } from "hono/factory";
import { pinoHttp } from "pino-http";

export const pinoLoggerMiddleware = createMiddleware(async (c, next) => {
  c.env.incoming.id = c.var.requestId;

  await new Promise<void>((resolve) =>
    pinoHttp({
      level: "debug",
      quietResLogger: true,
      quietReqLogger: true,
    })(c.env.incoming, c.env.outgoing, () => resolve()),
  );

  c.set("logger", c.env.incoming.log);

  await next();
});

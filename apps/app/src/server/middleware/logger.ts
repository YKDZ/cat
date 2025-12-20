import { logger } from "@cat/shared/utils";
import { createMiddleware } from "hono/factory";

export const pinoLoggerMiddleware = createMiddleware(async (c, next) => {
  if (process.env.NODE_ENV === "production") {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;

    logger.info("SERVER", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: ms,
    });
  } else {
    await next();
  }
});

import { serverLogger as logger } from "@cat/server-shared";
import { createMiddleware } from "hono/factory";

export default createMiddleware(async (c, next) => {
  if (process.env.NODE_ENV === "production") {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;

    logger.child({ component: "server" }).info("diagnostic event", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: ms,
    });
  } else {
    await next();
  }
});

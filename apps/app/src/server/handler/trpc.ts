import { Hono } from "hono";
import { appRouter } from "../trpc/_app";
import { createHttpContext } from "../trpc/context";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { logger } from "@cat/shared";

const app = new Hono();

app.all("*", (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: createHttpContext,
    onError: ({ error, ctx, input }) => {
      logger.error(
        "RPC",
        { input: JSON.stringify(input), url: c.req.url },
        error.cause,
      );
    },
  });
});

export const trpcHandler = app;

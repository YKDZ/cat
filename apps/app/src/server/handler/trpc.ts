import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { logger } from "@cat/shared/utils";
import { appRouter, createHttpContext } from "@cat/app-api/trpc";

const app = new Hono();

app.all("*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: createHttpContext,
    onError: ({ error, input, path }) => {
      logger.error("RPC", { input: JSON.stringify(input), path }, error.cause);
    },
  });
});

export const trpcHandler = app;

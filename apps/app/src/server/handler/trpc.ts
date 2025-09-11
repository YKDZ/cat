import { Hono } from "hono";
import { appRouter } from "@/server/trpc/_app.ts";
import { createHttpContext } from "@/server/trpc/context.ts";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { logger } from "@cat/shared/utils";

const app = new Hono();

app.all("*", (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: createHttpContext,
    onError: ({ error, ctx, input, path }) => {
      logger.error("RPC", { input: JSON.stringify(input), path }, error.cause);
    },
  });
});

export const trpcHandler = app;

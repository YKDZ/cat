import { Hono } from "hono";
import { appRouter } from "../trpc/_app";
import { createHttpContext } from "../trpc/context";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

const app = new Hono();

app.all("*", (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: createHttpContext,
  });
});

export const trpcHandler = app;

import { getRuntimeState } from "@cat/domain";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  if (!globalThis.inited) {
    return c.json(
      {
        status: "starting",
        message: "Server is initializing...",
        runtime: getRuntimeState() ?? null,
      },
      503,
    );
  }

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    runtime: getRuntimeState() ?? null,
  });
});

export default app;

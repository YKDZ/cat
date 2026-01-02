import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  if (!globalThis.inited) {
    return c.json(
      {
        status: "starting",
        message: "Server is initializing...",
      },
      503,
    );
  }

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default app;

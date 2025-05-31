import { Hono } from "hono";

const app = new Hono();

app.post("/", (c) => {
  return c.text("Health check OK");
});

export const healthHandler = app;

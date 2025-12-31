import { getHttpContext } from "@/utils/context";
import { Hono } from "hono";
import { telefunc } from "telefunc";

const app = new Hono();

app.all("*", async (c) => {
  const ctx = await getHttpContext(c.req.raw, c.res.headers);

  const httpResponse = await telefunc({
    context: { ...ctx },
    url: c.req.url,
    method: c.req.method,
    body: await c.req.text(),
  });

  const { body, statusCode } = httpResponse;

  return c.body(body, statusCode);
});

export const telefuncHandler = app;

import "dotenv/config";
import type { QueueOptions } from "bullmq";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

export const config = {
  connection: {
    host: url.hostname,
    port: Number(url.port),
  },
  prefix:
    process.env.NODE_ENV === "test"
      ? `bull:${process.env.VITEST_POOL_ID || "test"}:${randomUUID()}`
      : "bull",
} satisfies QueueOptions;

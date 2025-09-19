import type { QueueOptions } from "bullmq";

const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

export const config = {
  connection: {
    host: url.hostname,
    port: Number(url.port),
  },
} satisfies QueueOptions as QueueOptions;

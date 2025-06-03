import { QueueOptions } from "bullmq";

export const config = {
  connection: {
    host: new URL(process.env.REDIS_URL || "redis://localhost:6379").hostname,
    port: parseInt(
      new URL(process.env.REDIS_URL || "redis://localhost:6379").port,
    ),
  },
} satisfies QueueOptions;

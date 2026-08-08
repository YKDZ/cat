import type { RedisClientOptions, RedisClientType } from "redis";
import { createClient } from "redis";

export type RedisConnectionMode = "runtime" | "fail-fast";

export type RedisConnectionErrorHandler = (error: Error) => void;

type RedisConnectionSharedOptions = {
  url?: string | undefined;
  connectTimeoutMs?: number | undefined;
};

export type RedisConnectionOptions = RedisConnectionSharedOptions & {
  mode: RedisConnectionMode;
  onError: RedisConnectionErrorHandler;
};

export class RedisConnectionTimeoutError extends Error {
  public readonly code = "REDIS_CONNECTION_TIMEOUT" as const;

  public constructor(timeoutMs: number) {
    super(`Redis connection timed out after ${timeoutMs}ms.`);
    this.name = "RedisConnectionTimeoutError";
  }
}

export class RedisConnection {
  public redis: RedisClientType;
  private readonly connectTimeoutMs: number | undefined;
  private connectAttempt: Promise<void> | undefined;

  public constructor(options: RedisConnectionOptions) {
    const url = options.url ?? process.env.REDIS_URL;
    this.connectTimeoutMs = options.connectTimeoutMs;
    const socket: NonNullable<RedisClientOptions["socket"]> | undefined =
      options.mode === "fail-fast"
        ? {
            reconnectStrategy: false as const,
          }
        : undefined;
    this.redis = createClient({
      ...(url === undefined ? {} : { url }),
      ...(socket === undefined ? {} : { socket }),
    });
    this.redis.on("error", (error) => {
      try {
        options.onError(error);
      } catch {
        // Diagnostics must not alter Redis connection behavior.
      }
    });
  }

  async connect(): Promise<void> {
    if (this.redis.isOpen) return;
    if (this.connectAttempt) {
      await this.connectAttempt;
      return;
    }
    const connecting = this.redis.connect().then(() => undefined);
    this.connectAttempt = connecting;
    const timeoutMs = this.connectTimeoutMs;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (timeoutMs === undefined) {
        await connecting;
        return;
      }

      const deadline = new Promise<"TIMED_OUT">((resolve) => {
        timeout = setTimeout(() => resolve("TIMED_OUT"), timeoutMs);
      });
      const result = await Promise.race([
        connecting.then(() => "CONNECTED" as const),
        deadline,
      ]);
      if (result === "CONNECTED") return;

      const closed = new Promise<void>((resolve) => {
        this.redis.once("end", resolve);
      });
      this.disconnect();
      await Promise.all([closed, connecting.catch(() => undefined)]);
      throw new RedisConnectionTimeoutError(timeoutMs);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (this.connectAttempt === connecting) {
        this.connectAttempt = undefined;
      }
    }
  }

  disconnect(): void {
    if (this.redis.isOpen || this.connectAttempt) this.redis.destroy();
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}

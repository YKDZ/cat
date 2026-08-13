import { once } from "node:events";
import { createServer, type Server, type Socket } from "node:net";

import { describe, expect, it, vi } from "vitest";

import { RedisConnection, RedisConnectionTimeoutError } from "./redis.ts";

type ServerBehavior = "respond" | "drop" | "blackhole";

type ParsedCommand = {
  bytesRead: number;
  command: readonly string[];
};

type RedisEventSource = {
  once: (event: string, listener: () => void) => unknown;
  off: (event: string, listener: () => void) => unknown;
};

const waitForRedisEvent = async (
  source: RedisEventSource,
  event: string,
  timeoutMs: number,
): Promise<void> =>
  await new Promise<void>((resolve, reject) => {
    const handleEvent = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      source.off(event, handleEvent);
      reject(new Error(`Timed out waiting for Redis event: ${event}.`));
    }, timeoutMs);
    source.once(event, handleEvent);
  });

const parseCommand = (buffer: Buffer): ParsedCommand | undefined => {
  if (buffer.length === 0) return undefined;
  if (buffer[0] !== 42) throw new Error("Expected a RESP array.");
  const countEnd = buffer.indexOf("\r\n", 1, "utf8");
  if (countEnd === -1) return undefined;
  const count = Number.parseInt(buffer.toString("utf8", 1, countEnd), 10);
  let offset = countEnd + 2;
  const command: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.length <= offset) return undefined;
    if (buffer[offset] !== 36) throw new Error("Expected a RESP bulk string.");
    const lengthEnd = buffer.indexOf("\r\n", offset + 1, "utf8");
    if (lengthEnd === -1) return undefined;
    const length = Number.parseInt(
      buffer.toString("utf8", offset + 1, lengthEnd),
      10,
    );
    const valueStart = lengthEnd + 2;
    const valueEnd = valueStart + length;
    if (buffer.length < valueEnd + 2) return undefined;
    command.push(buffer.toString("utf8", valueStart, valueEnd));
    offset = valueEnd + 2;
  }
  return { bytesRead: offset, command };
};

const replyFor = (command: readonly string[]): string => {
  switch (command[0]?.toUpperCase()) {
    case undefined:
      throw new Error("Expected a non-empty RESP command.");
    case "HELLO":
      return "%0\r\n";
    case "PING":
      return "+PONG\r\n";
    default:
      return "+OK\r\n";
  }
};

const createRespServer = (behavior: ServerBehavior) => {
  let server: Server | undefined;
  const sockets = new Set<Socket>();
  let connectionCount = 0;

  const start = async (port = 0): Promise<number> => {
    server = createServer((socket) => {
      connectionCount += 1;
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      socket.once("end", () => socket.destroy());
      if (behavior === "drop") {
        socket.destroy();
        return;
      }
      if (behavior === "blackhole") {
        socket.resume();
        return;
      }

      let buffer = Buffer.alloc(0);
      socket.on("data", (data) => {
        buffer = Buffer.concat([buffer, data]);
        let parsed = parseCommand(buffer);
        while (parsed !== undefined) {
          socket.write(replyFor(parsed.command));
          buffer = buffer.subarray(parsed.bytesRead);
          parsed = parseCommand(buffer);
        }
      });
    });
    server.listen(port, "127.0.0.1");
    await once(server, "listening", { signal: AbortSignal.timeout(1_000) });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }
    return address.port;
  };

  const stop = async (): Promise<void> => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    const activeServer = server;
    server = undefined;
    if (activeServer === undefined || !activeServer.listening) return;
    await new Promise<void>((resolve, reject) =>
      activeServer.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      }),
    );
  };

  return {
    get activeSocketCount(): number {
      return sockets.size;
    },
    get connectionCount(): number {
      return connectionCount;
    },
    start,
    stop,
  };
};

describe("RedisConnection", () => {
  it("keeps runtime reconnection enabled and recovers on the same endpoint", async () => {
    const firstServer = createRespServer("respond");
    const secondServer = createRespServer("respond");
    const port = await firstServer.start();
    const onError = vi.fn();
    const connection = new RedisConnection({
      url: `redis://127.0.0.1:${port}`,
      mode: "runtime",
      onError,
    });

    try {
      await connection.connect();
      await expect(connection.redis.ping()).resolves.toBe("PONG");
      const reconnecting = waitForRedisEvent(
        connection.redis,
        "reconnecting",
        2_000,
      );

      await firstServer.stop();
      await reconnecting;
      const ready = waitForRedisEvent(connection.redis, "ready", 2_000);
      await secondServer.start(port);
      await ready;

      expect(secondServer.connectionCount).toBeGreaterThanOrEqual(1);
      expect(onError).toHaveBeenCalled();
      await expect(connection.redis.ping()).resolves.toBe("PONG");
    } finally {
      connection.disconnect();
      await firstServer.stop();
      await secondServer.stop();
    }
  }, 5_000);

  it("does not reconnect after a fail-fast connection failure", async () => {
    const server = createRespServer("drop");
    const port = await server.start();
    const onError = vi.fn();
    const connection = new RedisConnection({
      url: `redis://127.0.0.1:${port}`,
      mode: "fail-fast",
      connectTimeoutMs: 500,
      onError,
    });
    let reconnecting = 0;
    connection.redis.on("reconnecting", () => {
      reconnecting += 1;
    });

    try {
      await expect(connection.connect()).rejects.toBeInstanceOf(Error);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.connectionCount).toBe(1);
      expect(reconnecting).toBe(0);
      expect(onError).toHaveBeenCalled();
    } finally {
      connection.disconnect();
      await server.stop();
    }
  }, 2_000);

  it("bounds a blackhole handshake with the configured connection timeout", async () => {
    const server = createRespServer("blackhole");
    const port = await server.start();
    const connection = new RedisConnection({
      url: `redis://127.0.0.1:${port}`,
      mode: "fail-fast",
      connectTimeoutMs: 75,
      onError: () => {},
    });
    const destroy = vi.spyOn(connection.redis, "destroy");
    const startedAt = performance.now();

    try {
      await expect(connection.connect()).rejects.toBeInstanceOf(
        RedisConnectionTimeoutError,
      );
      expect(performance.now() - startedAt).toBeLessThan(500);
      expect(destroy).toHaveBeenCalledOnce();
      expect(connection.redis.isOpen).toBe(false);
      await vi.waitFor(() => expect(server.activeSocketCount).toBe(0), {
        timeout: 500,
      });
      expect(server.connectionCount).toBe(1);
    } finally {
      connection.disconnect();
      await server.stop();
    }
  }, 1_000);
});

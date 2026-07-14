import { createHash } from "node:crypto";
import http from "node:http";
import type { Duplex } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { injectApplicationWebSocket } from "./ws.ts";

const servers: http.Server[] = [];
const upgradedSockets: Duplex[] = [];

const listen = async (server: http.Server): Promise<number> => {
  return await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("WebSocket test server did not expose a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
};

const websocketStaysOpen = async (url: string): Promise<boolean> => {
  const socket = new WebSocket(url);
  return await Promise.race([
    new Promise<boolean>((resolve) => {
      socket.addEventListener("close", () => resolve(false), { once: true });
    }),
    new Promise<boolean>((resolve) => {
      socket.addEventListener("error", () => resolve(false), { once: true });
    }),
    new Promise<boolean>((resolve) => {
      socket.addEventListener(
        "open",
        () => {
          setTimeout(() => resolve(socket.readyState === WebSocket.OPEN), 25);
        },
        { once: true },
      );
    }),
  ]);
};

const acceptViteHmrUpgrade = (server: http.Server): void => {
  server.on("upgrade", (request, socket) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/")
      return;
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") return;
    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    upgradedSockets.push(socket);
  });
};

afterEach(async () => {
  upgradedSockets.splice(0).forEach((socket) => socket.destroy());
  await Promise.all(
    servers.splice(0).map(
      async (server) =>
        await new Promise<void>((resolve, reject) => {
          server.once("close", resolve);
          server.once("error", reject);
          server.close();
        }),
    ),
  );
});

describe("application WebSocket route", () => {
  it("leaves non-API upgrades available to Vite HMR", async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(404).end();
    });
    servers.push(server);
    injectApplicationWebSocket(server);
    acceptViteHmrUpgrade(server);
    const port = await listen(server);

    await expect(
      websocketStaysOpen(`ws://127.0.0.1:${port}/?token=vite-hmr`),
    ).resolves.toBe(true);
  });
});

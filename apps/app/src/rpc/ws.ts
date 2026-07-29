import type { AppRouter } from "@cat/app-api/orpc/router";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import { WebSocket } from "partysocket";

import { clientLogger as logger } from "#/utils/logger.ts";

const wsOrigin =
  typeof window === "undefined"
    ? "ws://localhost:3000"
    : window.location.origin
        .replace(/^https:\/\//, "wss://")
        .replace(/^http:\/\//, "ws://");

const socket = new WebSocket(`${wsOrigin}/api/ws`, undefined, {
  startClosed: true,
});
let notificationStreamSignal: AbortSignal | undefined;

const isExpectedQueueAbort = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

const link = new RPCLink({
  // oxlint-disable-next-line no-unsafe-type-assertion -- partysocket types readyState as number instead of 0|1|2|3
  websocket: socket as unknown as Pick<
    globalThis.WebSocket,
    "addEventListener" | "removeEventListener" | "send" | "readyState"
  >,
  headers: () => ({}),
  interceptors: [
    onError((error) => {
      if (notificationStreamSignal?.aborted || isExpectedQueueAbort(error))
        return;
      logger
        .child({ component: "web" })
        .error("Error when orpc", { error: error });
    }),
  ],
});

export const ws: RouterClient<AppRouter> = createORPCClient(link);

/**
 * Start the WebSocket once an authenticated session is available.
 */
export const connectWs = (): void => {
  if (
    socket.readyState === WebSocket.CONNECTING ||
    socket.readyState === WebSocket.OPEN
  ) {
    return;
  }
  socket.reconnect();
};

/**
 * Wait until a reconnecting socket can accept an RPC frame. Streams must not
 * be started while PartySocket is still negotiating the authenticated upgrade.
 */
export const waitForWsOpen = async (signal: AbortSignal): Promise<void> => {
  if (signal.aborted) throw signal.reason;
  if (socket.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolveOpen, rejectOpen) => {
    const cleanup = (): void => {
      socket.removeEventListener("open", open);
      signal.removeEventListener("abort", abort);
    };
    const open = (): void => {
      cleanup();
      resolveOpen();
    };
    const abort = (): void => {
      cleanup();
      rejectOpen(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    socket.addEventListener("open", open, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    connectWs();
  });
};

export const setNotificationStreamSignal = (
  signal: AbortSignal | undefined,
): void => {
  notificationStreamSignal = signal;
};

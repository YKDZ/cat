import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import { WebSocket } from "partysocket";

import { useBranchStore } from "@/stores/branch";
import { clientLogger as logger } from "@/utils/logger";

const wsOrigin =
  typeof window === "undefined"
    ? "ws://localhost:3000"
    : window.location.origin
        .replace(/^https:\/\//, "wss://")
        .replace(/^http:\/\//, "ws://");

const socket = new WebSocket(`${wsOrigin}/api/ws`);

const link = new RPCLink({
  // oxlint-disable-next-line no-unsafe-type-assertion -- partysocket types readyState as number instead of 0|1|2|3
  websocket: socket as unknown as Pick<
    globalThis.WebSocket,
    "addEventListener" | "send" | "readyState"
  >,
  headers: () => {
    const branchStore = useBranchStore();
    const headers: Record<string, string> = {};
    if (branchStore.currentBranchId !== null) {
      headers["x-branch-id"] = String(branchStore.currentBranchId);
    }
    return headers;
  },
  interceptors: [
    onError((error) => {
      logger.withSituation("WEB").error(error, "Error when orpc");
    }),
  ],
});

export const ws: RouterClient<AppRouter> = createORPCClient(link);

/**
 * @zh 登录成功后重连 WebSocket，确保新连接携带有效的会话 Cookie。
 * @en Reconnect the WebSocket after login so the new connection carries the session cookie.
 */
export const reconnectWs = (): void => {
  socket.reconnect();
};

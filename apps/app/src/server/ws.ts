import type { AppRouter } from "@cat/app-api/orpc/router";
import { logger } from "@cat/shared/utils";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import { WebSocket } from "partysocket";

const link = new RPCLink({
  websocket: new WebSocket("ws://localhost:3000/api/ws"),
  interceptors: [
    onError((error) => {
      logger.error("WEB", { msg: "Error when orpc" }, error);
    }),
  ],
});

export const ws: RouterClient<AppRouter> = createORPCClient(link);

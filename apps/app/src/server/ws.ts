import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { serverLogger as logger } from "@cat/server-shared";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import { WebSocket } from "partysocket";

const link = new RPCLink({
  // oxlint-disable-next-line no-unsafe-type-assertion -- partysocket types readyState as number instead of 0|1|2|3
  websocket: new WebSocket("ws://localhost:3000/api/ws") as unknown as Pick<
    globalThis.WebSocket,
    "addEventListener" | "send" | "readyState"
  >,
  interceptors: [
    onError((error) => {
      logger.withSituation("WEB").error({ msg: "Error when orpc" }, error);
    }),
  ],
});

export const ws: RouterClient<AppRouter> = createORPCClient(link);

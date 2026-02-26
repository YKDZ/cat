import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { logger } from "@cat/shared/utils";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

const link = new RPCLink({
  url: new URL("/api/rpc", "http://localhost:3000"),
  interceptors: [
    onError((error) => {
      logger.error("WEB", { msg: "Error when orpc" }, error);
    }),
  ],
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);

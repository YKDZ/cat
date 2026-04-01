import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import { clientLogger as logger } from "@/app/utils/logger";

const getCsrfToken = (): string | undefined => {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  return match?.[1];
};

const link = new RPCLink({
  url: new URL("/api/rpc", "http://localhost:3000"),
  headers: () => {
    const csrfToken = getCsrfToken();
    return csrfToken ? { "x-csrf-token": csrfToken } : {};
  },
  interceptors: [
    onError((error) => {
      logger.withSituation("WEB").error(error, "Error when orpc");
    }),
  ],
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);

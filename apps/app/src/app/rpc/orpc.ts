import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import { useBranchStore } from "@/app/stores/branch";
import { clientLogger as logger } from "@/app/utils/logger";

const getCsrfToken = (): string | undefined => {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  return match?.[1];
};

const rpcOrigin =
  typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin;

const link = new RPCLink({
  url: new URL("/api/rpc", rpcOrigin),
  headers: () => {
    const csrfToken = getCsrfToken();
    const branchStore = useBranchStore();
    const headers: Record<string, string> = {};
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
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

export const orpc: RouterClient<AppRouter> = createORPCClient(link);

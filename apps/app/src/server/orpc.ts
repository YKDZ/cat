import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "@cat/app-api/orpc/router";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

const link = new RPCLink({
  url: new URL("/api/rpc", window.location.origin),
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);

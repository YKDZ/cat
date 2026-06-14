import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

/**
 * Create an oRPC client authenticated via API Key Bearer token.
 */
export const createClient = (
  baseUrl: string,
  apiKey: string,
): RouterClient<AppRouter> => {
  const link = new RPCLink({
    url: new URL("/api/rpc", baseUrl),
    headers: () => ({
      authorization: `Bearer ${apiKey}`,
    }),
  });

  return createORPCClient(link);
};

/**
 * Dynamically call any oRPC handler by dot-separated path.
 *
 * @param client - oRPC client
 * @param path - Dot-separated path, e.g. "memory.searchByText"
 * @param input - JSON input parameters
 * @returns - Handler return value (may be AsyncIterable)
 */
export const callByPath = (
  client: RouterClient<AppRouter>,
  path: string,
  input: unknown,
): unknown => {
  const segments = path.split(".");
  // oRPC Proxy 客户端在运行时是函数代理；路由节点和叶子 handler 都可能表现为 function。
  let current: unknown = client;
  for (const segment of segments) {
    if (
      (typeof current !== "object" || current === null) &&
      typeof current !== "function"
    ) {
      throw new Error(
        `Invalid path segment '${segment}': parent is not an object`,
      );
    }
    current = Reflect.get(current, segment);
  }
  if (typeof current !== "function") {
    throw new Error(`Path '${path}' does not resolve to a callable handler`);
  }
  // oxlint-disable-next-line no-unsafe-type-assertion -- narrowed by typeof check above
  return (current as (arg: unknown) => unknown)(input);
};

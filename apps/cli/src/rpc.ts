import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

/**
 * @zh 创建 oRPC 客户端（API Key Bearer 认证）。
 * @en Create an oRPC client authenticated via API Key Bearer token.
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
 * @zh 通过点分路径动态调用任意 oRPC handler。
 * @en Dynamically call any oRPC handler by dot-separated path.
 *
 * @param client - {@zh oRPC 客户端} {@en oRPC client}
 * @param path - {@zh 点分路径，如 "memory.searchByText"} {@en Dot-separated path, e.g. "memory.searchByText"}
 * @param input - {@zh JSON 输入参数} {@en JSON input parameters}
 * @returns - {@zh handler 返回值（可能是 AsyncIterable）} {@en Handler return value (may be AsyncIterable)}
 */
export const callByPath = (
  client: RouterClient<AppRouter>,
  path: string,
  input: unknown,
): unknown => {
  const segments = path.split(".");
  // Proxy 客户端支持任意字符串属性访问，逐层递归创建子 Proxy
  let current: unknown = client;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) {
      throw new Error(
        `Invalid path segment '${segment}': parent is not an object`,
      );
    }
    // oxlint-disable-next-line no-unsafe-type-assertion -- narrowed by typeof check above
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current !== "function") {
    throw new Error(`Path '${path}' does not resolve to a callable handler`);
  }
  // oxlint-disable-next-line no-unsafe-type-assertion -- narrowed by typeof check above
  return (current as (arg: unknown) => unknown)(input);
};

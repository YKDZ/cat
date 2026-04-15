import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { describe, expect, it, vi } from "vitest";

import { callByPath } from "./rpc.ts";

const createFunctionRouteProxy = (
  properties: Record<string, unknown>,
): RouterClient<AppRouter> =>
  // oxlint-disable-next-line no-unsafe-type-assertion -- test helper intentionally mimics oRPC runtime function proxies
  new Proxy((() => undefined) as unknown as RouterClient<AppRouter>, {
    get: (_target, prop) =>
      typeof prop === "string" ? properties[prop] : undefined,
  });

describe("callByPath", () => {
  it("resolves handlers from function-based oRPC route proxies", () => {
    const payload = { smoke: true };
    const handler = vi.fn((input: unknown) => ({ input }));
    const client = createFunctionRouteProxy({
      auth: createFunctionRouteProxy({
        listApiKeysEndpoint: handler,
      }),
    });

    const result = callByPath(client, "auth.listApiKeysEndpoint", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ input: payload });
  });
});

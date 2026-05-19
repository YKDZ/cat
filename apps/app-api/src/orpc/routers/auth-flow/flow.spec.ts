import { createTestContext } from "@cat/test-utils";
import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import type { Context } from "@/utils/context";

const mocks = vi.hoisted(() => {
  const cacheStores: unknown[] = [];
  const initFlow = vi.fn().mockResolvedValue({
    flowId: "11111111-1111-4111-8111-111111111111",
    status: "pending",
    currentNode: null,
    progress: {
      completedSteps: 0,
      totalEstimatedSteps: 1,
    },
  });

  return {
    cacheStores,
    initFlow,
  };
});

vi.mock("@cat/auth", () => ({
  AuthFlowRegistry: class {
    public register = vi.fn();
  },
  AuthNodeRegistry: class {
    public register = vi.fn();
  },
  AuthFlowScheduler: class {
    public initFlow = mocks.initFlow;
    public advanceFlow = vi.fn();
    public getFlowState = vi.fn();
  },
  CacheFlowStorage: class {
    public constructor(cacheStore: unknown) {
      mocks.cacheStores.push(cacheStore);
    }

    public save = vi.fn();
    public load = vi.fn();
    public delete = vi.fn();
  },
  credentialCollectorExecutor: Symbol("credential_collector"),
  pluginCustomExecutor: Symbol("plugin_custom"),
  sessionFinalizerExecutor: Symbol("session_finalizer"),
  standardLoginFlow: { id: "standard-login" },
  registerFlow: { id: "register" },
}));

vi.mock("@/orpc/routers/auth-flow/executors.ts", () => ({
  appDecisionRouterExecutor: Symbol("decision"),
  appIdentityResolverExecutor: Symbol("identity"),
  passwordFactorExecutor: Symbol("password"),
  totpFactorExecutor: Symbol("totp"),
}));

vi.mock("@/orpc/routers/auth/schemas.ts", () => ({
  finishLogin: vi.fn(),
}));

import { initFlow } from "./flow";

describe("auth flow router", () => {
  it("initializes a flow without requiring context.redis", async () => {
    // oxlint-disable-next-line no-unsafe-type-assertion -- route under test only passes the client through scheduler wiring
    const fakeDrizzleClient = {} as Context["drizzleDB"]["client"];
    // oxlint-disable-next-line no-unsafe-type-assertion -- route under test only passes the plugin manager through scheduler wiring
    const fakePluginManager = {} as Context["pluginManager"];
    const fakeDrizzleDB: Context["drizzleDB"] = {
      client: fakeDrizzleClient,
      connect: async () => {
        /* noop */
      },
      disconnect: async () => {
        /* noop */
      },
      ping: async () => {
        /* noop */
      },
      migrate: async () => undefined,
    };

    const context = {
      ...createTestContext({
        drizzleDB: fakeDrizzleDB,
        pluginManager: fakePluginManager,
      }),
      auth: null,
      isSSR: false,
      isWebSocket: false,
    } satisfies Context;

    const result = await call(initFlow, { flowType: "login" }, { context });

    expect(result).toMatchObject({
      flowId: "11111111-1111-4111-8111-111111111111",
      status: "pending",
    });
    expect(mocks.initFlow).toHaveBeenCalledOnce();
    expect(mocks.cacheStores).toEqual([context.cacheStore]);
  });
});

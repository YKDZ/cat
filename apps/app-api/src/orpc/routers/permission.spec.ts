import { createAuthedTestContext } from "@cat/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "@/utils/context";

const mocks = vi.hoisted(() => ({
  determineWriteMode: vi.fn(),
  getPermissionEngine: vi.fn(() => ({ name: "engine" })),
}));

vi.mock("@cat/permissions", () => ({
  determineWriteMode: mocks.determineWriteMode,
  getPermissionEngine: mocks.getPermissionEngine,
}));

import { getProjectWriteMode } from "./permission";

type ProcedureInternal = {
  handler: (options: {
    context: Context;
    input: unknown;
    errors: Record<string, never>;
    path: string[];
    signal: AbortSignal | undefined;
  }) => Promise<unknown>;
};

const noop = (): undefined => undefined;

const getProcedureInternal = (procedure: unknown): ProcedureInternal => {
  if (typeof procedure !== "object" || procedure === null) {
    throw new TypeError("Expected an oRPC procedure object");
  }

  const internal = Reflect.get(procedure, "~orpc");
  if (typeof internal !== "object" || internal === null) {
    throw new TypeError("Expected oRPC internals on the procedure");
  }

  const handler = Reflect.get(internal, "handler");
  if (typeof handler !== "function") {
    throw new TypeError("Expected oRPC handler function");
  }

  return {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrow test-only access to oRPC internals
    handler: handler as ProcedureInternal["handler"],
  };
};

const invokeHandler = async (
  procedure: unknown,
  context: Context,
  input: unknown,
) => {
  const internal = getProcedureInternal(procedure);

  return await internal.handler({
    context,
    input,
    errors: {},
    path: [],
    signal: undefined,
  });
};

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bounded fake DB for unit test context
const fakeDb = null as unknown as Context["drizzleDB"]["client"];

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bounded fake drizzle DB for unit test context
const fakeDrizzleDb = {
  client: fakeDb,
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
} as Context["drizzleDB"];

const createMockContext = (): Context => {
  const base = createAuthedTestContext(
    {
      id: "11111111-1111-4111-8111-111111111111",
      email: "permission-router@test.local",
      name: "Permission Router Tester",
      emailVerified: true,
      avatarFileId: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
    {
      drizzleDB: fakeDrizzleDb,
      helpers: {
        setCookie: noop,
        delCookie: noop,
        getCookie: (name) => (name === "csrfToken" ? "csrf-token" : null),
        getQueryParam: () => undefined,
        getReqHeader: (name) =>
          name === "x-csrf-token" ? "csrf-token" : undefined,
        setResHeader: noop,
      },
    },
  );

  return {
    ...base,
    auth: {
      subjectType: "user",
      subjectId: "11111111-1111-4111-8111-111111111111",
      systemRoles: [],
      scopes: null,
      traceId: undefined,
      ip: undefined,
      userAgent: undefined,
    },
    csrfToken: "csrf-token",
    isSSR: false,
    isWebSocket: false,
    requestSignal: new AbortController().signal,
  };
};

describe("permission.getProjectWriteMode", () => {
  const projectId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    mocks.determineWriteMode.mockReset();
    mocks.getPermissionEngine.mockClear();
  });

  it.each(["direct", "isolation", "no_access"] as const)(
    "returns %s from determineWriteMode",
    async (mode) => {
      mocks.determineWriteMode.mockResolvedValue(mode);

      const output = await invokeHandler(
        getProjectWriteMode,
        createMockContext(),
        { projectId },
      );

      expect(output).toBe(mode);
      expect(mocks.determineWriteMode).toHaveBeenCalledWith(
        { name: "engine" },
        expect.objectContaining({
          subjectId: "11111111-1111-4111-8111-111111111111",
        }),
        projectId,
      );
    },
  );
});

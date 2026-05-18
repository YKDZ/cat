import { createAuthedTestContext } from "@cat/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Context } from "@/utils/context";

const { permissionCheck } = vi.hoisted(() => ({
  permissionCheck: vi.fn(async () => true),
}));

vi.mock("@cat/permissions", () => ({
  getPermissionEngine: () => ({ check: permissionCheck }),
  determineWriteMode: async () => "direct",
  loadUserSystemRoles: async () => [],
}));

import router from "@/orpc/router";

import { listContentNodes } from "./project";
import { onCreate } from "./translation";

type ProcedureInternal = {
  middlewares: Array<
    (
      options: {
        context: Context;
        next: (nextOptions?: { context?: Record<string, unknown> }) => Promise<{
          output: unknown;
          context: Record<string, unknown>;
        }>;
        errors: Record<string, never>;
        path: string[];
        signal: AbortSignal | undefined;
      },
      input: unknown,
      outputFn: () => void,
    ) => Promise<{ output: unknown; context: Record<string, unknown> }>
  >;
  handler: (options: {
    context: Context;
    input: unknown;
    errors: Record<string, never>;
    path: string[];
    signal: AbortSignal | undefined;
  }) => Promise<unknown>;
};

const noop = (): undefined => undefined;

const isAsyncGenerator = (value: unknown): value is AsyncGenerator => {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, Symbol.asyncIterator) === "function";
};

const isProcedureInternal = (value: unknown): value is ProcedureInternal => {
  if (typeof value !== "object" || value === null) return false;
  const middlewares = Reflect.get(value, "middlewares");
  const handler = Reflect.get(value, "handler");

  return Array.isArray(middlewares) && typeof handler === "function";
};

const getProcedureInternal = (procedure: unknown): ProcedureInternal => {
  if (typeof procedure !== "object" || procedure === null) {
    throw new TypeError("Expected an oRPC procedure object");
  }

  const internal = Reflect.get(procedure, "~orpc");
  if (!isProcedureInternal(internal)) {
    throw new TypeError("Expected oRPC internals on the procedure");
  }

  return internal;
};

const invokeProcedure = async (
  procedure: unknown,
  context: Context,
  input: unknown,
): Promise<unknown> => {
  const internal = getProcedureInternal(procedure);

  const run = async (
    index: number,
    currentContext: Context,
  ): Promise<unknown> => {
    const middleware = internal.middlewares[index];
    if (!middleware) {
      return await internal.handler({
        context: currentContext,
        input,
        errors: {},
        path: [],
        signal: undefined,
      });
    }

    const result = await middleware(
      {
        context: currentContext,
        next: async (nextOptions) => ({
          output: await run(index + 1, {
            ...currentContext,
            ...(nextOptions?.context ?? {}),
          } as Context),
          context: nextOptions?.context ?? {},
        }),
        errors: {},
        path: [],
        signal: undefined,
      },
      input,
      noop,
    );

    return result.output;
  };

  return await run(0, context);
};

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal DB test double for middleware wiring tests
const fakeDb = null as unknown as Context["drizzleDB"]["client"];

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal drizzle DB test double for middleware wiring tests
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
      email: "router-contract@test.local",
      name: "Router Contract Tester",
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

describe("app router contract", () => {
  beforeEach(() => {
    permissionCheck.mockClear();
    permissionCheck.mockResolvedValue(true);
  });

  test("root router exposes content-node and file namespaces without document", () => {
    expect("document" in router).toBe(false);
    expect(router.contentNode).toBeDefined();
    expect(router.file).toBeDefined();
  });

  test("project exports listContentNodes without the legacy list alias", () => {
    const legacyListAlias = ["get", "Documents"].join("");

    expect(listContentNodes).toBeDefined();
    expect(legacyListAlias in router.project).toBe(false);
  });

  test("translation.onCreate accepts editor scope input and checks project viewer permission", async () => {
    const context = createMockContext();

    const output = await invokeProcedure(onCreate, context, {
      projectId: "22222222-2222-4222-8222-222222222222",
      languageToId: "zh-Hans",
      contentNodeIds: [],
      searchQuery: "",
      statusFilter: "all",
      pageSize: 16,
    });

    expect(isAsyncGenerator(output)).toBe(true);
    if (!isAsyncGenerator(output)) {
      throw new TypeError(
        "Expected translation.onCreate to return an async generator",
      );
    }

    expect(permissionCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: "11111111-1111-4111-8111-111111111111",
      }),
      {
        type: "project",
        id: "22222222-2222-4222-8222-222222222222",
      },
      "viewer",
    );
    await output.return?.(undefined);
  });

  test("translation.onCreate rejects forbidden project scope through checkPermission", async () => {
    permissionCheck.mockResolvedValue(false);

    await expect(
      invokeProcedure(onCreate, createMockContext(), {
        projectId: "33333333-3333-4333-8333-333333333333",
        languageToId: "zh-Hans",
        contentNodeIds: [],
        searchQuery: "",
        statusFilter: "all",
        pageSize: 16,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

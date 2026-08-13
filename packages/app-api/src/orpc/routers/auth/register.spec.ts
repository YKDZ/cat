import { PluginManager } from "@cat/plugin-core";
import { ServiceImplementationResolutionError } from "@cat/server-shared";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { createTestContext } from "@cat/test-utils";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "#/utils/context.ts";

const mocks = vi.hoisted(() => ({
  resolveServiceImplementation: vi.fn(),
}));

vi.mock("@cat/server-shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/server-shared")>(
      "@cat/server-shared",
    );
  return {
    ...actual,
    resolveServiceImplementation: mocks.resolveServiceImplementation,
  };
});

import { register } from "./register.ts";

const passwordReference = ServiceImplementationReferenceSchema.parse({
  pluginId: "password-auth-provider",
  serviceId: "PASSWORD",
  serviceType: "AUTH_FACTOR",
  scopeType: "GLOBAL",
  scopeId: "",
});

const context = (): Context => ({
  ...createTestContext({
    pluginManager: new PluginManager("GLOBAL", ""),
    // The resolver fails before registration accesses the database.
    // oxlint-disable-next-line no-unsafe-type-assertion
    drizzleDB: { client: {} } as Context["drizzleDB"],
  }),
  auth: {
    subjectType: "user",
    subjectId: "00000000-0000-0000-0000-000000000001",
    systemRoles: [],
    scopes: null,
  },
  isSSR: false,
  isWebSocket: false,
  requestSignal: new AbortController().signal,
});

const registerInput = {
  email: "register@example.com",
  name: "Register test",
  password: "password",
};

describe("auth.register password provider resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the exact global PASSWORD auth-factor identity", async () => {
    mocks.resolveServiceImplementation.mockImplementation(
      (_pluginManager, reference, expectedServiceType) => {
        expect(reference).toEqual(passwordReference);
        expect(expectedServiceType).toBe("AUTH_FACTOR");
        throw new ServiceImplementationResolutionError({
          kind: "MISSING_IMPLEMENTATION",
          reference: passwordReference,
          expectedServiceType: "AUTH_FACTOR",
        });
      },
    );

    await expect(
      call(register, registerInput, { context: context() }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Password authentication provider is unavailable.",
    });
    expect(mocks.resolveServiceImplementation).toHaveBeenCalledOnce();
  });

  it("does not rewrite unexpected resolution failures", async () => {
    const unexpected = new Error("plugin registry crashed");
    mocks.resolveServiceImplementation.mockImplementation(() => {
      throw unexpected;
    });

    await expect(
      call(register, registerInput, { context: context() }),
    ).rejects.toBe(unexpected);
  });
});

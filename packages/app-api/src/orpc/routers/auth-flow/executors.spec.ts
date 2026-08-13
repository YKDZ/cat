import { describe, expect, it, vi } from "vitest";

const domainMocks = vi.hoisted(() => ({ executeQuery: vi.fn() }));

vi.mock("@cat/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/domain")>()),
  executeQuery: domainMocks.executeQuery,
}));

import { passwordFactorExecutor, totpFactorExecutor } from "./executors.ts";

const primaryReference = {
  pluginId: "password-auth-provider",
  serviceId: "PASSWORD",
  serviceType: "AUTH_FACTOR" as const,
  scopeType: "GLOBAL" as const,
  scopeId: "" as const,
};

const mfaReference = {
  pluginId: "totp-mfa-provider",
  serviceId: "TOTP",
  serviceType: "AUTH_FACTOR" as const,
  scopeType: "GLOBAL" as const,
  scopeId: "" as const,
};

const createContext = (overrides: Record<string, unknown> = {}) => {
  const pluginManager = {
    getServices: vi.fn(),
    resolveServiceImplementationReference: vi.fn(),
  };

  pluginManager.resolveServiceImplementationReference.mockImplementation(
    (reference: { serviceId: string }) => ({
      kind: "RESOLVED" as const,
      reference,
      service: {
        id: reference.serviceId,
        service: {
          execute: vi.fn().mockResolvedValue({ status: "success", aal: 1 }),
        },
      },
    }),
  );

  return {
    input: { token: "123456" },
    services: { db: {}, pluginManager },
    httpContext: { ip: "127.0.0.1", userAgent: "test" },
    blackboard: {
      identity: {
        userId: "11111111-1111-4111-8111-111111111111",
        identifier: "user@example.com",
        ...overrides,
      },
      completedFactors: [],
    },
  };
};

const nodeDef = { id: "factor", clientHint: { componentType: "input" } };

describe("auth factor implementation references", () => {
  it("keeps the password account reference as the login provider", async () => {
    domainMocks.executeQuery.mockResolvedValueOnce(primaryReference);
    const context = createContext();

    // oxlint-disable-next-line no-unsafe-type-assertion -- test fixture is the public executor context slice.
    const result = await passwordFactorExecutor(
      context as never,
      nodeDef as never,
    );

    expect(result).toMatchObject({
      status: "advance",
      updates: { "identity.authProvider": primaryReference },
    });
    expect(
      context.services.pluginManager.resolveServiceImplementationReference,
    ).toHaveBeenCalledWith(primaryReference, "AUTH_FACTOR");
  });

  it("uses the persisted MFA reference without replacing the login provider", async () => {
    domainMocks.executeQuery.mockResolvedValueOnce(mfaReference);
    const context = createContext({ authProvider: primaryReference });
    const resolution =
      context.services.pluginManager.resolveServiceImplementationReference;
    const factor = {
      execute: vi.fn().mockResolvedValue({ status: "success", aal: 2 }),
    };
    resolution.mockReturnValue({
      kind: "RESOLVED",
      reference: mfaReference,
      service: { id: "TOTP", service: factor },
    });

    // oxlint-disable-next-line no-unsafe-type-assertion -- test fixture is the public executor context slice.
    const result = await totpFactorExecutor(context as never, nodeDef as never);

    expect(factor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ serviceReference: mfaReference }),
    );
    expect(result).toMatchObject({ status: "advance" });
    expect(result.updates).not.toHaveProperty("identity.authProvider");
  });

  it("fails when the durable account or MFA reference cannot be resolved", async () => {
    domainMocks.executeQuery
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mfaReference);
    const passwordContext = createContext();
    const mfaContext = createContext();
    mfaContext.services.pluginManager.resolveServiceImplementationReference.mockReturnValue(
      {
        kind: "SERVICE_TYPE_MISMATCH",
        reference: mfaReference,
        expectedServiceType: "AUTH_FACTOR",
        actualServiceType: "STORAGE_PROVIDER",
      },
    );

    // oxlint-disable-next-line no-unsafe-type-assertion -- test fixture is the public executor context slice.
    await expect(
      passwordFactorExecutor(passwordContext as never, nodeDef as never),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "FACTOR_NOT_CONFIGURED" },
    });
    // oxlint-disable-next-line no-unsafe-type-assertion -- test fixture is the public executor context slice.
    await expect(
      totpFactorExecutor(mfaContext as never, nodeDef as never),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "FACTOR_NOT_CONFIGURED" },
    });
  });
});

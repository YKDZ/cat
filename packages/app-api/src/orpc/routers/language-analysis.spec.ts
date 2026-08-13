import { createAuthedTestContext } from "@cat/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "#/utils/context.ts";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return { ...actual, executeQuery: mocks.executeQuery };
});

type ProcedureInternal = {
  handler: (options: {
    context: Context;
    input: unknown;
    errors: Record<string, never>;
    path: string[];
    signal: AbortSignal | undefined;
  }) => Promise<unknown>;
};

const invokeHandler = async (
  procedure: unknown,
  context: Context,
  input: unknown,
): Promise<unknown> => {
  if (typeof procedure !== "object" || procedure === null) {
    throw new TypeError("Expected an oRPC procedure object");
  }
  const internal = Reflect.get(procedure, "~orpc");
  if (typeof internal !== "object" || internal === null) {
    throw new TypeError("Expected oRPC internals");
  }
  const handler = Reflect.get(internal, "handler");
  if (typeof handler !== "function") throw new TypeError("Expected handler");
  return await (handler as ProcedureInternal["handler"])({
    context,
    input,
    errors: {},
    path: [],
    signal: undefined,
  });
};

import { getProjectObservations } from "./language-analysis.ts";

const context = {
  ...createAuthedTestContext(undefined, {
    drizzleDB: { client: {} } as Context["drizzleDB"],
  }),
  auth: {
    subjectType: "user" as const,
    subjectId: "11111111-1111-4111-8111-111111111111",
    systemRoles: [],
    scopes: null,
  },
  csrfToken: "csrf-token",
  isSSR: false,
  isWebSocket: false,
  requestSignal: new AbortController().signal,
} as Context;

describe("languageAnalysis.getProjectObservations", () => {
  beforeEach(() => {
    mocks.executeQuery.mockReset();
    mocks.executeQuery.mockImplementation(async (_context, _query, input) =>
      "projectId" in input
        ? ["de", "fr"]
        : {
            languageId: input.languageId,
            source: "NONE",
            selection: null,
            tombstone: null,
            observation: null,
            assessment: {
              status: "UNKNOWN",
              languageId: input.languageId,
              policyEpoch: 0,
              selection: null,
              blocker: null,
              assessedAt: new Date(),
            },
          },
    );
  });

  it("performs only TTL-bound observation reads for the authorized project batch", async () => {
    await expect(
      invokeHandler(getProjectObservations, context, {
        projectId: "22222222-2222-4222-8222-222222222222",
      }),
    ).resolves.toMatchObject([
      { languageId: "de", assessment: { status: "UNKNOWN" } },
      { languageId: "fr", assessment: { status: "UNKNOWN" } },
    ]);

    expect(mocks.executeQuery).toHaveBeenCalledTimes(3);
    expect(mocks.executeQuery).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      { projectId: "22222222-2222-4222-8222-222222222222" },
    );
    expect(mocks.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      { languageId: "de", ttlMs: 60_000 },
    );
    expect(mocks.executeQuery).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.anything(),
      { languageId: "fr", ttlMs: 60_000 },
    );
  });
});

import type { DrizzleDB } from "@cat/domain";

import { createAuthedTestContext } from "@cat/test-utils";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "@/utils/context";

const domainMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  addElementContextEvidence: Symbol("addElementContextEvidence"),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return {
    ...actual,
    executeCommand: domainMocks.executeCommand,
    addElementContextEvidence: domainMocks.addElementContextEvidence,
  };
});

vi.mock("@cat/permissions", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/permissions")>(
      "@cat/permissions",
    );
  return {
    ...actual,
    getPermissionEngine: () => ({
      check: vi.fn().mockResolvedValue(true),
    }),
  };
});

import { addScreenshotEvidence } from "@/orpc/routers/collection";

const createMockDrizzleDB = (): Context["drizzleDB"] => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Test-only stub; this router only reads drizzleDB.client.
  const client = { mocked: true } as unknown as DrizzleDB["client"];

  return {
    client,
    connect: async () => Promise.resolve(),
    disconnect: async () => Promise.resolve(),
    migrate: async () => Promise.resolve(),
    ping: async () => Promise.resolve(),
  };
};

const createContext = (): Context => {
  const base = createAuthedTestContext();

  return {
    ...base,
    auth: {
      subjectType: "user",
      subjectId: base.user!.id,
      systemRoles: ["admin"],
      scopes: [],
    },
    drizzleDB: createMockDrizzleDB(),
    isSSR: true,
    isWebSocket: false,
  } as Context;
};

describe("collection.addScreenshotEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainMocks.executeCommand.mockResolvedValue({ addedCount: 1 });
  });

  it("maps uploaded screenshots to addElementContextEvidence", async () => {
    const projectId = "44444444-4444-4444-8444-444444444444";

    const result = await call(
      addScreenshotEvidence,
      {
        projectId,
        screenshots: [
          {
            elementId: 42,
            elementRef: "vue-i18n:src/App.vue:template:L1",
            fileId: 7,
            route: "/projects/demo",
            highlightRegion: { x: 10, y: 20, width: 30, height: 40 },
          },
        ],
      },
      { context: createContext() },
    );

    expect(result).toEqual({ addedCount: 1 });
    expect(domainMocks.executeCommand).toHaveBeenCalledWith(
      { db: expect.objectContaining({ mocked: true }) },
      domainMocks.addElementContextEvidence,
      {
        projectId,
        evidence: [
          {
            elementId: 42,
            kind: "SCREENSHOT",
            fileId: 7,
            jsonData: {
              highlightRegion: { x: 10, y: 20, width: 30, height: 40 },
            },
            displayLabel: "screenshot:/projects/demo",
            trustLevel: "COLLECTED",
            provenance: {
              source: "screenshot-collector",
              route: "/projects/demo",
              elementRef: "vue-i18n:src/App.vue:template:L1",
            },
          },
        ],
      },
    );
  });

  it("stores null jsonData when highlightRegion is absent", async () => {
    const projectId = "44444444-4444-4444-8444-444444444444";

    await call(
      addScreenshotEvidence,
      {
        projectId,
        screenshots: [
          {
            elementId: 42,
            elementRef: "vue-i18n:src/App.vue:template:L1",
            fileId: 7,
            route: "/projects/demo",
          },
        ],
      },
      { context: createContext() },
    );

    expect(domainMocks.executeCommand).toHaveBeenCalledWith(
      { db: expect.objectContaining({ mocked: true }) },
      domainMocks.addElementContextEvidence,
      {
        projectId,
        evidence: [
          expect.objectContaining({
            jsonData: null,
            displayLabel: "screenshot:/projects/demo",
          }),
        ],
      },
    );
  });
});

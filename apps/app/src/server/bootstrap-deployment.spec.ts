import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyBootstrapPlan: Symbol("applyBootstrapPlan"),
  BootstrapPlanSchema: { parse: vi.fn((value: unknown) => value) },
  bootstrapApplicationData: vi.fn().mockResolvedValue(undefined),
  executeCommand: vi.fn().mockResolvedValue({ status: "applied" }),
  syncApplicationPluginDefinitions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@cat/domain", () => ({
  applyBootstrapPlan: mocks.applyBootstrapPlan,
  BootstrapPlanSchema: mocks.BootstrapPlanSchema,
  executeCommand: mocks.executeCommand,
}));

vi.mock("./application-data-bootstrap.ts", () => ({
  bootstrapApplicationData: mocks.bootstrapApplicationData,
  syncApplicationPluginDefinitions: mocks.syncApplicationPluginDefinitions,
}));

import {
  bootstrapDeployment,
  resolveDeploymentBootstrapPlan,
} from "./bootstrap-deployment.ts";

describe("official deployment bootstrap", () => {
  it("uses a stable non-secret deployment plan when no caller plan is supplied", () => {
    expect(resolveDeploymentBootstrapPlan("")).toEqual({
      version: "1",
      idempotencyKey: "official-spacy-v1",
      operations: [
        {
          type: "install-if-absent",
          pluginId: "spacy-segmenter",
          scopeType: "GLOBAL",
          scopeId: "",
          value: { serverUrl: "http://spacy:8000" },
        },
      ],
    });
  });

  it("syncs all definitions, applies the one-shot plan, then runs full ordinary bootstrap", async () => {
    const database = { client: { transaction: vi.fn() } };
    const pluginManager = {};

    await expect(
      bootstrapDeployment({
        database: database as never,
        pluginManager: pluginManager as never,
      }),
    ).resolves.toEqual({ status: "applied" });

    expect(mocks.syncApplicationPluginDefinitions).toHaveBeenCalledWith({
      database,
      pluginManager,
    });
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      { db: database.client },
      mocks.applyBootstrapPlan,
      resolveDeploymentBootstrapPlan(""),
    );
    expect(mocks.bootstrapApplicationData).toHaveBeenCalledWith({
      database,
      pluginManager,
    });
    expect(
      mocks.syncApplicationPluginDefinitions.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.executeCommand.mock.invocationCallOrder[0]!);
    expect(mocks.executeCommand.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bootstrapApplicationData.mock.invocationCallOrder[0]!,
    );
  });

  it("accepts a caller supplied generic plan", () => {
    const plan = {
      idempotencyKey: "local-services-v1",
      operations: [],
      version: "1",
    };
    expect(resolveDeploymentBootstrapPlan(JSON.stringify(plan))).toEqual(plan);
  });
});

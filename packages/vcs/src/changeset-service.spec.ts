import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationMethodRegistry } from "./application-method-registry.ts";
import type { ApplicationMethod } from "./application-method.ts";
import {
  ChangeSetApplicationError,
  ChangeSetService,
} from "./changeset-service.ts";
import { DiffStrategyRegistry } from "./diff-strategy-registry.ts";

const domain = vi.hoisted(() => ({
  applyChangeset: vi.fn(),
  getChangesetEntries: vi.fn(),
  updateChangesetAsyncStatus: vi.fn(),
  updateEntryAsyncStatus: vi.fn(),
}));

vi.mock("@cat/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/domain")>()),
  applyChangeset: domain.applyChangeset,
  getChangesetEntries: domain.getChangesetEntries,
  updateChangesetAsyncStatus: domain.updateChangesetAsyncStatus,
  updateEntryAsyncStatus: domain.updateEntryAsyncStatus,
}));

const entry = {
  action: "CREATE" as const,
  after: { text: "translated" },
  asyncStatus: null,
  before: null,
  changesetId: 41,
  entityId: "translation-candidate-1",
  entityType: "translation",
  fieldPath: null,
  id: 73,
  reviewStatus: "APPROVED" as const,
  riskLevel: "LOW" as const,
};

const applicationMethod = (
  status: "FAILED" | "BLOCKED",
): ApplicationMethod => ({
  applyCreate: vi.fn().mockResolvedValue({
    status,
    errorMessage: "materialization rejected",
  }),
  applyDelete: vi.fn(),
  applyRollback: vi.fn(),
  applyUpdate: vi.fn(),
  asyncDependencySpec: null,
  compensate: vi.fn(),
  entityType: "translation",
  fetchCurrentState: vi.fn(),
  fetchCurrentStates: vi.fn(),
  validateDependencies: vi.fn(),
});

const serviceWith = (method: ApplicationMethod): ChangeSetService => {
  const registry = new ApplicationMethodRegistry();
  registry.register("translation", method);
  return new ChangeSetService(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- behavior test uses the domain command boundary as its database seam
    {} as never,
    new DiffStrategyRegistry(),
    registry,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  domain.getChangesetEntries.mockResolvedValue([entry]);
});

describe("ChangeSetService application", () => {
  it.each(["FAILED", "BLOCKED"] as const)(
    "does not mark a changeset APPLIED when an entry is %s",
    async (status) => {
      const service = serviceWith(applicationMethod(status));

      await expect(
        service.applyChangeSet(41, { projectId: "project-1" }),
      ).rejects.toMatchObject({
        name: ChangeSetApplicationError.name,
        changesetId: 41,
        entryId: 73,
        status,
      });
      expect(domain.updateEntryAsyncStatus).toHaveBeenCalledWith(
        expect.anything(),
        { entryId: 73, asyncStatus: "FAILED" },
      );
      expect(domain.applyChangeset).not.toHaveBeenCalled();
      expect(domain.updateChangesetAsyncStatus).toHaveBeenCalledWith(
        expect.anything(),
        { changesetId: 41, asyncStatus: "HAS_FAILED" },
      );
    },
  );
});

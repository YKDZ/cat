import {
  appendChangesetEntriesIfUnchanged,
  executeCommand,
  executeQuery,
  getChangesetEntries,
  type DbHandle,
} from "@cat/domain";
import {
  ChangeActionSchema,
  EntityTypeSchema,
  RiskLevelSchema,
  type JSONType,
} from "@cat/shared";
import * as z from "zod";

export class BranchWriteInactiveError extends Error {
  public constructor() {
    super("The branch is no longer active.");
    this.name = "BranchWriteInactiveError";
  }
}

export class BranchWriteConflictError extends Error {
  public constructor() {
    super("The branch changed concurrently. Retry the write.");
    this.name = "BranchWriteConflictError";
  }
}

export type BranchChangesetEntry = {
  entityType: z.infer<typeof EntityTypeSchema>;
  entityId: string;
  action: z.infer<typeof ChangeActionSchema>;
  before: JSONType | null;
  after: JSONType | null;
  fieldPath: string | null;
  riskLevel: z.infer<typeof RiskLevelSchema>;
};

/**
 * Appends aggregate snapshots with an optimistic retry so callers only own
 * aggregate construction, not changeset compare-and-append mechanics.
 */
export const appendBranchChangesWithRetry = async (input: {
  db: DbHandle;
  changesetId: number;
  build: (
    entries: Awaited<ReturnType<typeof getChangesetEntries>>,
  ) => Promise<BranchChangesetEntry[]>;
}): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const entries = await executeQuery({ db: input.db }, getChangesetEntries, {
      changesetId: input.changesetId,
    });
    const appended = await executeCommand(
      { db: input.db },
      appendChangesetEntriesIfUnchanged,
      {
        changesetId: input.changesetId,
        expectedLatestEntryId:
          Math.max(...entries.map((entry) => entry.id), 0) || null,
        entries: await input.build(entries),
      },
    );
    if (appended.status === "APPENDED") return;
    if (appended.status === "BRANCH_NOT_ACTIVE") {
      throw new BranchWriteInactiveError();
    }
  }
  throw new BranchWriteConflictError();
};

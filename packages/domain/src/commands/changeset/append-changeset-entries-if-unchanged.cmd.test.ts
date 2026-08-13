import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendChangesetEntriesIfUnchanged,
  createBranch,
  createChangeset,
  createProject,
  createUser,
} from "#/commands/index.ts";
import { executeCommand } from "#/executor.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";
import type { DrizzleClient } from "#/types.ts";

describe("appendChangesetEntriesIfUnchanged", () => {
  let db: TestDB;
  let changesetId: number;

  beforeEach(async () => {
    db = await setupTestDB();
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `changeset-cas-${crypto.randomUUID()}@test.local`,
      name: "Changeset CAS tester",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      name: "Changeset CAS project",
      description: null,
      creatorId: user.id,
    });
    const branch = await executeCommand({ db: db.client }, createBranch, {
      projectId: project.id,
      name: `cas-${crypto.randomUUID()}`,
      createdBy: user.id,
    });
    changesetId = (
      await executeCommand({ db: db.client }, createChangeset, {
        projectId: project.id,
        branchId: branch.id,
      })
    ).id;
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("allows only one concurrent append from the same changeset revision", async () => {
    const firstClient = await db.openConcurrentClient();
    const secondClient = await db.openConcurrentClient();
    const append = async (client: DrizzleClient, entityId: string) =>
      await executeCommand({ db: client }, appendChangesetEntriesIfUnchanged, {
        changesetId,
        expectedLatestEntryId: null,
        entries: [
          {
            entityType: "term_concept",
            entityId,
            action: "CREATE",
            before: null,
            after: { concept: entityId },
            fieldPath: null,
            riskLevel: "MEDIUM",
          },
        ],
      });

    try {
      const [first, second] = await Promise.all([
        append(firstClient.client, "1"),
        append(secondClient.client, "2"),
      ]);

      expect([first.status, second.status].sort()).toEqual([
        "APPENDED",
        "CONFLICT",
      ]);
    } finally {
      await Promise.all([firstClient.cleanup(), secondClient.cleanup()]);
    }
  });
});

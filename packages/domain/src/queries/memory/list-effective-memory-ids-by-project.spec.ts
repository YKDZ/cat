import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createMemory,
  createProject,
  createUser,
  ensurePersonalProjectMemory,
} from "@/commands";
import { executeCommand, executeQuery } from "@/executor";
import { listEffectiveMemoryIdsByProject } from "@/queries";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("listEffectiveMemoryIdsByProject", () => {
  it("returns project memories plus only current user's personal memory", async () => {
    const owner = await executeCommand({ db: testDb.client }, createUser, {
      email: `owner-${randomUUID()}@example.com`,
      name: "Owner",
    });
    const userA = await executeCommand({ db: testDb.client }, createUser, {
      email: `user-a-${randomUUID()}@example.com`,
      name: "User A",
    });
    const userB = await executeCommand({ db: testDb.client }, createUser, {
      email: `user-b-${randomUUID()}@example.com`,
      name: "User B",
    });

    const projectA = await executeCommand(
      { db: testDb.client },
      createProject,
      {
        name: `project-a-${randomUUID()}`,
        description: null,
        creatorId: owner.id,
      },
    );
    const projectB = await executeCommand(
      { db: testDb.client },
      createProject,
      {
        name: `project-b-${randomUUID()}`,
        description: null,
        creatorId: owner.id,
      },
    );

    const projectMemoryA = await executeCommand(
      { db: testDb.client },
      createMemory,
      {
        name: "Project Memory A",
        creatorId: owner.id,
        projectIds: [projectA.id],
      },
    );

    await executeCommand({ db: testDb.client }, createMemory, {
      name: "Project Memory B",
      creatorId: owner.id,
      projectIds: [projectB.id],
    });

    const personalA = await executeCommand(
      { db: testDb.client },
      ensurePersonalProjectMemory,
      {
        userId: userA.id,
        projectId: projectA.id,
      },
    );

    await executeCommand({ db: testDb.client }, ensurePersonalProjectMemory, {
      userId: userB.id,
      projectId: projectA.id,
    });

    const result = await executeQuery(
      { db: testDb.client },
      listEffectiveMemoryIdsByProject,
      {
        projectId: projectA.id,
        userId: userA.id,
      },
    );

    expect(result.projectMemoryIds).toEqual([projectMemoryA.id]);
    expect(result.personalMemoryIds).toEqual([personalA.memoryId]);
    expect(result.allMemoryIds).toEqual([
      projectMemoryA.id,
      personalA.memoryId,
    ]);
  });

  it("returns only project memory IDs when userId is omitted", async () => {
    const owner = await executeCommand({ db: testDb.client }, createUser, {
      email: `owner-no-user-${randomUUID()}@example.com`,
      name: "Owner No User",
    });

    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `project-no-user-${randomUUID()}`,
      description: null,
      creatorId: owner.id,
    });

    const projectMemory = await executeCommand(
      { db: testDb.client },
      createMemory,
      {
        name: "Project Memory",
        creatorId: owner.id,
        projectIds: [project.id],
      },
    );

    const result = await executeQuery(
      { db: testDb.client },
      listEffectiveMemoryIdsByProject,
      {
        projectId: project.id,
      },
    );

    expect(result.projectMemoryIds).toEqual([projectMemory.id]);
    expect(result.personalMemoryIds).toEqual([]);
    expect(result.allMemoryIds).toEqual([projectMemory.id]);
  });
});

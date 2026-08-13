import { randomUUID } from "node:crypto";

import { eq, glossary, memory, project } from "@cat/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createGlossary,
  createMemory,
  createProject,
  createUser,
  ensurePersonalProjectMemory,
} from "#/commands/index.ts";
import { executeCommand, executeQuery } from "#/executor.ts";
import {
  listAccessibleProjects,
  listEffectiveMemoryIdsByProject,
  listGlossariesByCreator,
  listMemoriesByCreator,
} from "#/queries/index.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("resource list query scopes", () => {
  it("searches owned resources by name and description without widening creator or project scope", async () => {
    const suffix = randomUUID();
    const literal = `%_\\${suffix}`;
    const owner = await executeCommand({ db: testDb.client }, createUser, {
      email: `resource-owner-${suffix}@example.com`,
      name: "Resource owner",
    });
    const other = await executeCommand({ db: testDb.client }, createUser, {
      email: `resource-other-${suffix}@example.com`,
      name: "Resource other",
    });
    const ownedProject = await executeCommand(
      { db: testDb.client },
      createProject,
      {
        name: `project-name-${suffix}`,
        description: `project-description-${literal}`,
        creatorId: owner.id,
      },
    );
    const otherProject = await executeCommand(
      { db: testDb.client },
      createProject,
      {
        name: `project-name-${suffix}`,
        description: `project-description-${literal}`,
        creatorId: other.id,
      },
    );
    const ownedMemory = await executeCommand(
      { db: testDb.client },
      createMemory,
      {
        name: `memory-name-${suffix}`,
        description: `memory-description-${literal}`,
        creatorId: owner.id,
      },
    );
    await executeCommand({ db: testDb.client }, createMemory, {
      name: `memory-name-${suffix}`,
      description: `memory-description-${literal}`,
      creatorId: other.id,
    });
    const ownedGlossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `glossary-name-${suffix}`,
        description: `glossary-description-${literal}`,
        creatorId: owner.id,
      },
    );
    await executeCommand({ db: testDb.client }, createGlossary, {
      name: `glossary-name-${suffix}`,
      description: `glossary-description-${literal}`,
      creatorId: other.id,
    });

    await expect(
      executeQuery({ db: testDb.client }, listAccessibleProjects, {
        pagination: "unpaged",
        projectIds: [ownedProject.id],
        search: literal,
      }),
    ).resolves.toMatchObject({
      data: [{ id: ownedProject.id }],
      total: 1,
    });
    await expect(
      executeQuery({ db: testDb.client }, listAccessibleProjects, {
        pagination: "unpaged",
        projectIds: [ownedProject.id],
        search: `project-name-${suffix}`,
      }),
    ).resolves.toMatchObject({
      data: [{ id: ownedProject.id }],
      total: 1,
    });
    await expect(
      executeQuery({ db: testDb.client }, listAccessibleProjects, {
        pagination: "unpaged",
        projectIds: [otherProject.id],
        search: literal,
      }),
    ).resolves.toMatchObject({ total: 1 });

    await expect(
      executeQuery({ db: testDb.client }, listMemoriesByCreator, {
        creatorId: owner.id,
        pagination: "unpaged",
        search: literal,
      }),
    ).resolves.toMatchObject({
      data: [{ id: ownedMemory.id }],
      total: 1,
    });
    await expect(
      executeQuery({ db: testDb.client }, listMemoriesByCreator, {
        creatorId: owner.id,
        pagination: "unpaged",
        search: `memory-name-${suffix}`,
      }),
    ).resolves.toMatchObject({ total: 1 });

    await expect(
      executeQuery({ db: testDb.client }, listGlossariesByCreator, {
        creatorId: owner.id,
        pagination: "unpaged",
        search: literal,
      }),
    ).resolves.toMatchObject({
      data: [{ id: ownedGlossary.id }],
      total: 1,
    });
    await expect(
      executeQuery({ db: testDb.client }, listGlossariesByCreator, {
        creatorId: owner.id,
        pagination: "unpaged",
        search: `glossary-name-${suffix}`,
      }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it("treats percent, underscore, and backslash search text as literals", async () => {
    const suffix = randomUUID();
    const owner = await executeCommand({ db: testDb.client }, createUser, {
      email: `literal-owner-${suffix}@example.com`,
      name: "Literal owner",
    });
    const cases = [
      { label: "percent", literal: "%", decoy: "x" },
      { label: "underscore", literal: "_", decoy: "x" },
      { label: "backslash", literal: "\\", decoy: "" },
    ] as const;
    const projects = (
      await Promise.all(
        cases.map(async ({ label, literal, decoy }) => [
          await executeCommand({ db: testDb.client }, createProject, {
            name: `project-${label}-${literal}${suffix}`,
            description: null,
            creatorId: owner.id,
          }),
          await executeCommand({ db: testDb.client }, createProject, {
            name: `project-${label}-${decoy}${suffix}`,
            description: null,
            creatorId: owner.id,
          }),
        ]),
      )
    ).flat();
    const memories = (
      await Promise.all(
        cases.map(async ({ label, literal, decoy }) => [
          await executeCommand({ db: testDb.client }, createMemory, {
            name: `memory-${label}-${literal}${suffix}`,
            creatorId: owner.id,
          }),
          await executeCommand({ db: testDb.client }, createMemory, {
            name: `memory-${label}-${decoy}${suffix}`,
            creatorId: owner.id,
          }),
        ]),
      )
    ).flat();
    const glossaries = (
      await Promise.all(
        cases.map(async ({ label, literal, decoy }) => [
          await executeCommand({ db: testDb.client }, createGlossary, {
            name: `glossary-${label}-${literal}${suffix}`,
            creatorId: owner.id,
          }),
          await executeCommand({ db: testDb.client }, createGlossary, {
            name: `glossary-${label}-${decoy}${suffix}`,
            creatorId: owner.id,
          }),
        ]),
      )
    ).flat();

    for (const [index, { label, literal }] of cases.entries()) {
      const projectTarget = projects[index * 2]!;
      const memoryTarget = memories[index * 2]!;
      const glossaryTarget = glossaries[index * 2]!;
      await expect(
        executeQuery({ db: testDb.client }, listAccessibleProjects, {
          pagination: "unpaged",
          projectIds: projects.map((entry) => entry.id),
          search: `project-${label}-${literal}${suffix}`,
        }),
      ).resolves.toMatchObject({ data: [{ id: projectTarget.id }], total: 1 });
      await expect(
        executeQuery({ db: testDb.client }, listMemoriesByCreator, {
          creatorId: owner.id,
          pagination: "unpaged",
          search: `memory-${label}-${literal}${suffix}`,
        }),
      ).resolves.toMatchObject({ data: [{ id: memoryTarget.id }], total: 1 });
      await expect(
        executeQuery({ db: testDb.client }, listGlossariesByCreator, {
          creatorId: owner.id,
          pagination: "unpaged",
          search: `glossary-${label}-${literal}${suffix}`,
        }),
      ).resolves.toMatchObject({
        data: [{ id: glossaryTarget.id }],
        total: 1,
      });
    }
  });

  it("keeps equal-timestamp resource pages stable with an id tie-breaker", async () => {
    const suffix = randomUUID();
    const owner = await executeCommand({ db: testDb.client }, createUser, {
      email: `stable-page-owner-${suffix}@example.com`,
      name: "Stable page owner",
    });
    const createdAt = new Date("2026-08-09T00:00:00.000Z");
    const projects = await Promise.all(
      ["c", "a", "b"].map((name) =>
        executeCommand({ db: testDb.client }, createProject, {
          description: null,
          name: `stable-project-${name}-${suffix}`,
          creatorId: owner.id,
        }),
      ),
    );
    const memories = await Promise.all(
      ["c", "a", "b"].map((name) =>
        executeCommand({ db: testDb.client }, createMemory, {
          name: `stable-memory-${name}-${suffix}`,
          creatorId: owner.id,
        }),
      ),
    );
    const glossaries = await Promise.all(
      ["c", "a", "b"].map((name) =>
        executeCommand({ db: testDb.client }, createGlossary, {
          name: `stable-glossary-${name}-${suffix}`,
          creatorId: owner.id,
        }),
      ),
    );
    await Promise.all([
      testDb.client
        .update(project)
        .set({ createdAt })
        .where(eq(project.creatorId, owner.id)),
      testDb.client
        .update(memory)
        .set({ createdAt })
        .where(eq(memory.creatorId, owner.id)),
      testDb.client
        .update(glossary)
        .set({ createdAt })
        .where(eq(glossary.creatorId, owner.id)),
    ]);

    const pageIds = async (
      fetchPage: (
        pageIndex: number,
      ) => Promise<{ data: Array<{ id: string }> }>,
    ) => {
      const [first, second] = await Promise.all([fetchPage(0), fetchPage(1)]);
      return [...first.data, ...second.data].map((entry) => entry.id);
    };
    const expectedProjectIds = projects.map((entry) => entry.id).sort();
    const expectedMemoryIds = memories.map((entry) => entry.id).sort();
    const expectedGlossaryIds = glossaries.map((entry) => entry.id).sort();

    for (const desc of [false, true]) {
      const projectOrder = desc
        ? expectedProjectIds.toReversed()
        : expectedProjectIds;
      const memoryOrder = desc
        ? expectedMemoryIds.toReversed()
        : expectedMemoryIds;
      const glossaryOrder = desc
        ? expectedGlossaryIds.toReversed()
        : expectedGlossaryIds;

      await expect(
        pageIds((pageIndex) =>
          executeQuery({ db: testDb.client }, listAccessibleProjects, {
            pageIndex,
            pageSize: 2,
            projectIds: expectedProjectIds,
            sort: { id: "createdAt", desc },
          }),
        ),
      ).resolves.toEqual(projectOrder);
      await expect(
        pageIds((pageIndex) =>
          executeQuery({ db: testDb.client }, listMemoriesByCreator, {
            creatorId: owner.id,
            pageIndex,
            pageSize: 2,
            sort: { id: "createdAt", desc },
          }),
        ),
      ).resolves.toEqual(memoryOrder);
      await expect(
        pageIds((pageIndex) =>
          executeQuery({ db: testDb.client }, listGlossariesByCreator, {
            creatorId: owner.id,
            pageIndex,
            pageSize: 2,
            sort: { id: "createdAt", desc },
          }),
        ),
      ).resolves.toEqual(glossaryOrder);
    }
  });
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

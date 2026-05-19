import { qaReviewProfile } from "@cat/db";
import { QaReviewProfileConfigSchema } from "@cat/shared";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createBranch,
  createContentNodeUnderParent,
  createProject,
  createRootContentNode,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
} from "@/commands";
import { executeCommand, executeQuery } from "@/executor";
import {
  defaultQaReviewProfileConfig,
  resolveQaReviewProfile,
} from "@/queries";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;
let creatorId: string;

const buildConfig = (input: {
  semantic?: boolean;
  ruleFamily: string;
  riskScore: number;
}) =>
  QaReviewProfileConfigSchema.parse({
    enabledLayers: {
      deterministic: true,
      semantic: input.semantic ?? false,
    },
    rules: [
      {
        ruleFamily: input.ruleFamily,
        action: "NEEDS_REVIEW",
        riskScore: input.riskScore,
        minConfidenceBasisPoints: 0,
      },
    ],
    llm: {
      maxTokens: 1200,
      temperature: 0,
      minRiskScoreForQueue: 40,
    },
  });

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const creator = await executeCommand({ db: testDb.client }, createUser, {
    email: `resolve-review-profile-${randomUUID()}@example.com`,
    name: "Resolve Review Profile Tester",
  });
  creatorId = creator.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("resolveQaReviewProfile", () => {
  it("returns the built-in deterministic-only default when no profile exists", async () => {
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `resolve-profile-default-${randomUUID()}`,
      description: null,
      creatorId,
    });

    const result = await executeQuery(
      { db: testDb.client },
      resolveQaReviewProfile,
      {
        projectId: project.id,
        languageId: "zh-Hans",
      },
    );

    expect(result.profileId).toBeNull();
    expect(result.config).toEqual(defaultQaReviewProfileConfig);
  });

  it("prefers a language-specific profile over the project default", async () => {
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `resolve-profile-language-${randomUUID()}`,
      description: null,
      creatorId,
    });

    await testDb.client.insert(qaReviewProfile).values([
      {
        projectId: project.id,
        name: "Project default",
        config: buildConfig({ ruleFamily: "default", riskScore: 30 }),
        isDefault: true,
      },
      {
        projectId: project.id,
        languageId: "zh-Hans",
        name: "Chinese profile",
        config: buildConfig({ ruleFamily: "language", riskScore: 65 }),
        isDefault: false,
      },
    ]);

    const result = await executeQuery(
      { db: testDb.client },
      resolveQaReviewProfile,
      {
        projectId: project.id,
        languageId: "zh-Hans",
      },
    );

    expect(result.profileId).not.toBeNull();
    expect(result.config.rules[0]?.ruleFamily).toBe("language");
    expect(result.config.rules[0]?.riskScore).toBe(65);
  });

  it("matches content-node-specific profiles only for the same node and otherwise falls back", async () => {
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `resolve-profile-node-${randomUUID()}`,
      description: null,
      creatorId,
    });
    const root = await executeCommand(
      { db: testDb.client },
      createRootContentNode,
      { projectId: project.id, creatorId },
    );
    const fileA = await executeCommand(
      { db: testDb.client },
      createContentNodeUnderParent,
      {
        projectId: project.id,
        creatorId,
        parentContentNodeId: root.id,
        kind: "FILE",
        displayLabel: "a.json",
        importerId: "test-json",
        sourceRootRef: "root",
        stableSourceNodeRef: `node-a-${randomUUID()}`,
        exportRole: "FILE",
        boundaryType: "FILE",
        localOrder: 0,
      },
    );
    const fileB = await executeCommand(
      { db: testDb.client },
      createContentNodeUnderParent,
      {
        projectId: project.id,
        creatorId,
        parentContentNodeId: root.id,
        kind: "FILE",
        displayLabel: "b.json",
        importerId: "test-json",
        sourceRootRef: "root",
        stableSourceNodeRef: `node-b-${randomUUID()}`,
        exportRole: "FILE",
        boundaryType: "FILE",
        localOrder: 1,
      },
    );

    await testDb.client.insert(qaReviewProfile).values([
      {
        projectId: project.id,
        languageId: "zh-Hans",
        name: "Language fallback",
        config: buildConfig({ ruleFamily: "fallback", riskScore: 50 }),
      },
      {
        projectId: project.id,
        languageId: "zh-Hans",
        contentNodeId: fileA.id,
        name: "File A profile",
        config: buildConfig({ ruleFamily: "node", riskScore: 90 }),
      },
    ]);

    const matched = await executeQuery(
      { db: testDb.client },
      resolveQaReviewProfile,
      {
        projectId: project.id,
        languageId: "zh-Hans",
        contentNodeId: fileA.id,
      },
    );
    const fallback = await executeQuery(
      { db: testDb.client },
      resolveQaReviewProfile,
      {
        projectId: project.id,
        languageId: "zh-Hans",
        contentNodeId: fileB.id,
      },
    );

    expect(matched.config.rules[0]?.ruleFamily).toBe("node");
    expect(fallback.config.rules[0]?.ruleFamily).toBe("fallback");
  });

  it("matches branch-specific profiles only for the same branch and never when branchId is omitted", async () => {
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `resolve-profile-branch-${randomUUID()}`,
      description: null,
      creatorId,
    });
    const branch = await executeCommand({ db: testDb.client }, createBranch, {
      projectId: project.id,
      name: `resolve-branch-${randomUUID()}`,
      createdBy: creatorId,
    });

    await testDb.client.insert(qaReviewProfile).values([
      {
        projectId: project.id,
        languageId: "zh-Hans",
        name: "Language fallback",
        config: buildConfig({ ruleFamily: "fallback", riskScore: 55 }),
      },
      {
        projectId: project.id,
        languageId: "zh-Hans",
        branchId: branch.id,
        name: "Branch profile",
        config: buildConfig({ ruleFamily: "branch", riskScore: 95 }),
      },
    ]);

    const matched = await executeQuery(
      { db: testDb.client },
      resolveQaReviewProfile,
      {
        projectId: project.id,
        languageId: "zh-Hans",
        branchId: branch.id,
      },
    );
    const noBranch = await executeQuery(
      { db: testDb.client },
      resolveQaReviewProfile,
      {
        projectId: project.id,
        languageId: "zh-Hans",
      },
    );

    expect(matched.config.rules[0]?.ruleFamily).toBe("branch");
    expect(noBranch.config.rules[0]?.ruleFamily).toBe("fallback");
  });
});

/**
 * Integration tests for findOrCreateAutoTranslatePR.
 *
 * Validates:
 * - Creates a new AUTO_TRANSLATE PR + changeset when none exists
 * - Returns the same PR on subsequent calls (idempotent find-or-create)
 * - Creates separate PRs per language
 * - Returns existing changeset ID if branch already has one
 * - listPRs with excludeTypes filters out AUTO_TRANSLATE PRs
 * - listPRs with type filter returns only AUTO_TRANSLATE PRs
 */

import type { TestDB } from "@cat/test-utils";

import {
  createProject,
  createUser,
  executeCommand,
  executeQuery,
  getLatestBranchChangesetId,
  listPRs,
  updateProjectFeatures,
} from "@cat/domain";
import { setupTestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { findOrCreateAutoTranslatePR } from "../find-or-create-auto-translate-pr";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

async function seedProject(): Promise<{ projectId: string; userId: string }> {
  const newUser = await executeCommand({ db: testDb.client }, createUser, {
    email: `find-or-create-pr-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
    name: "Find Or Create PR Tester",
  });

  const newProject = await executeCommand(
    { db: testDb.client },
    createProject,
    {
      name: "Find Or Create PR Test Project",
      description: null,
      creatorId: newUser.id,
    },
  );

  await executeCommand({ db: testDb.client }, updateProjectFeatures, {
    projectId: newProject.id,
    features: { issues: false, pullRequests: true },
  });

  return { projectId: newProject.id, userId: newUser.id };
}

describe("findOrCreateAutoTranslatePR", () => {
  test("creates a new PR and changeset when none exists", async () => {
    const { projectId } = await seedProject();

    const result = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    expect(result.prId).toBeGreaterThan(0);
    expect(result.branchId).toBeGreaterThan(0);
    expect(result.changesetId).toBeGreaterThan(0);
  });

  test("returns the same PR and changeset on a second call (idempotent)", async () => {
    const { projectId } = await seedProject();

    const first = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    const second = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    expect(second.prId).toBe(first.prId);
    expect(second.branchId).toBe(first.branchId);
    expect(second.changesetId).toBe(first.changesetId);
  });

  test("reuses existing branch changeset rather than creating a duplicate", async () => {
    const { projectId } = await seedProject();

    const { branchId, changesetId: firstCsId } =
      await findOrCreateAutoTranslatePR(
        { db: testDb.client },
        { projectId, languageId: "ja" },
      );

    // Verify the changeset is recorded on the branch
    const csIdFromQuery = await executeQuery(
      { db: testDb.client },
      getLatestBranchChangesetId,
      { branchId },
    );
    expect(csIdFromQuery).toBe(firstCsId);

    // Second call should return the same changeset
    const second = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "ja" },
    );
    expect(second.changesetId).toBe(firstCsId);
  });

  test("creates separate PRs for different languages", async () => {
    const { projectId } = await seedProject();

    const zhResult = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    const jaResult = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "ja" },
    );

    expect(zhResult.prId).not.toBe(jaResult.prId);
    expect(zhResult.branchId).not.toBe(jaResult.branchId);
    expect(zhResult.changesetId).not.toBe(jaResult.changesetId);
  });

  test("created PR has type AUTO_TRANSLATE", async () => {
    const { projectId } = await seedProject();

    await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "fr" },
    );

    // listPRs with AUTO_TRANSLATE type filter should find our PR
    const autoPrs = await executeQuery({ db: testDb.client }, listPRs, {
      projectId,
      type: "AUTO_TRANSLATE",
      limit: 50,
      offset: 0,
    });

    expect(autoPrs.length).toBeGreaterThan(0);
    expect(autoPrs.every((pr) => pr.type === "AUTO_TRANSLATE")).toBe(true);
  });
});

describe("listPRs — AUTO_TRANSLATE filtering", () => {
  test("excludeTypes removes AUTO_TRANSLATE PRs from results", async () => {
    const { projectId } = await seedProject();

    // Create one AUTO_TRANSLATE PR
    await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "de" },
    );

    const prs = await executeQuery({ db: testDb.client }, listPRs, {
      projectId,
      excludeTypes: ["AUTO_TRANSLATE"],
      limit: 50,
      offset: 0,
    });

    expect(prs.every((pr) => pr.type !== "AUTO_TRANSLATE")).toBe(true);
  });

  test("type filter returns only AUTO_TRANSLATE PRs", async () => {
    const { projectId } = await seedProject();

    await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "ko" },
    );

    const prs = await executeQuery({ db: testDb.client }, listPRs, {
      projectId,
      type: "AUTO_TRANSLATE",
      limit: 50,
      offset: 0,
    });

    expect(prs.length).toBeGreaterThan(0);
    expect(prs.every((pr) => pr.type === "AUTO_TRANSLATE")).toBe(true);
  });
});

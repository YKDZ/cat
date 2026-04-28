import { randomUUID } from "node:crypto";
import { mkdtempSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock before importing the module under test
vi.mock("../shared/file-lock.js", () => ({
  acquireLock: vi.fn(() => async () => {}),
}));

import type {
  WorkflowRun,
  DecisionBlock,
  CoordinatorState,
  IssueSyncMapping,
} from "../shared/types.js";

import {
  ensureStateDirs,
  saveWorkflowRun,
  loadWorkflowRun,
  listWorkflowRuns,
  saveDecision,
  loadDecision,
  listDecisions,
  saveCoordinatorState,
  loadCoordinatorState,
  saveSyncMappings,
  loadSyncMappings,
} from "./state-store.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "auto-dev-test-"));
  await ensureStateDirs(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const makeRun = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: randomUUID(),
  issueNumber: 1,
  repoFullName: "owner/repo",
  currentPhase: null,
  status: "pending",
  branch: "auto-dev/issue-1",
  agentProvider: null,
  agentModel: null,
  agentEffort: null,
  agentDefinition: null,
  runId: null,
  namespace: null,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  decisionCount: 0,
  pendingDecisionIds: [],
  ...overrides,
});

const makeDecision = (
  overrides: Partial<DecisionBlock> = {},
): DecisionBlock => ({
  id: randomUUID(),
  workflowRunId: randomUUID(),
  title: "Test decision",
  options: [{ key: "a", label: "Option A", description: "First option" }],
  recommendation: "a",
  context: null,
  status: "pending",
  resolution: null,
  resolvedBy: null,
  resolutionChannel: null,
  requestedAt: new Date().toISOString(),
  resolvedAt: null,
  socketConnectionId: null,
  ...overrides,
});

describe("ensureStateDirs", () => {
  it("creates all directories", async () => {
    // Already called in beforeEach, verify they exist
    expect(existsSync(resolve(tmpDir, "tools/auto-dev/state/runs"))).toBe(true);
    expect(existsSync(resolve(tmpDir, "tools/auto-dev/state/decisions"))).toBe(
      true,
    );
    expect(existsSync(resolve(tmpDir, "tools/auto-dev/state/sync"))).toBe(true);
  });
});

describe("WorkflowRun CRUD", () => {
  it("save + load round-trips correctly", async () => {
    const run = makeRun();
    await saveWorkflowRun(tmpDir, run);
    const loaded = loadWorkflowRun(tmpDir, run.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(run.id);
    expect(loaded!.issueNumber).toBe(run.issueNumber);
    expect(loaded!.status).toBe("pending");
  });

  it("loadWorkflowRun returns null for missing file", () => {
    const loaded = loadWorkflowRun(tmpDir, "nonexistent-id");
    expect(loaded).toBeNull();
  });

  it("listWorkflowRuns returns all saved runs", async () => {
    await saveWorkflowRun(tmpDir, makeRun());
    await saveWorkflowRun(tmpDir, makeRun());
    await saveWorkflowRun(tmpDir, makeRun());
    const list = listWorkflowRuns(tmpDir);
    expect(list).toHaveLength(3);
  });

  it("listWorkflowRuns returns empty array when dir missing", () => {
    const list = listWorkflowRuns("/nonexistent/path");
    expect(list).toEqual([]);
  });
});

describe("DecisionBlock CRUD", () => {
  it("save + load round-trips correctly", async () => {
    const decision = makeDecision();
    await saveDecision(tmpDir, decision);
    const loaded = loadDecision(tmpDir, decision.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(decision.id);
    expect(loaded!.status).toBe("pending");
  });

  it("pending decision persists correctly", async () => {
    const decision = makeDecision({ status: "pending", resolution: null });
    await saveDecision(tmpDir, decision);
    const loaded = loadDecision(tmpDir, decision.id);
    expect(loaded!.status).toBe("pending");
    expect(loaded!.resolution).toBeNull();
  });

  it("resolved decision persists correctly", async () => {
    const decision = makeDecision({
      status: "resolved",
      resolution: "a",
      resolvedBy: "human",
      resolvedAt: new Date().toISOString(),
    });
    await saveDecision(tmpDir, decision);
    const loaded = loadDecision(tmpDir, decision.id);
    expect(loaded!.status).toBe("resolved");
    expect(loaded!.resolution).toBe("a");
  });

  it("loadDecision returns null for missing file", () => {
    const loaded = loadDecision(tmpDir, "nonexistent-id");
    expect(loaded).toBeNull();
  });

  it("listDecisions returns all decisions", async () => {
    for (let i = 0; i < 5; i++) {
      await saveDecision(tmpDir, makeDecision());
    }
    const list = listDecisions(tmpDir);
    expect(list).toHaveLength(5);
  });
});

describe("CoordinatorState", () => {
  it("save + load round-trips correctly", async () => {
    const state: CoordinatorState = {
      startedAt: new Date().toISOString(),
      pollIntervalSec: 30,
      activeRunIds: ["run-1", "run-2"],
    };
    await saveCoordinatorState(tmpDir, state);
    const loaded = loadCoordinatorState(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.startedAt).toBe(state.startedAt);
    expect(loaded!.pollIntervalSec).toBe(30);
    expect(loaded!.activeRunIds).toEqual(["run-1", "run-2"]);
  });

  it("returns null when file missing", () => {
    const loaded = loadCoordinatorState(tmpDir);
    expect(loaded).toBeNull();
  });
});

describe("IssueSyncMapping", () => {
  it("save + load round-trips correctly", async () => {
    const mappings: IssueSyncMapping[] = [
      {
        issueNumber: 1,
        namespace: "auto-dev-1",
        syncedFiles: [],
        lastSyncAt: new Date().toISOString(),
      },
      {
        issueNumber: 2,
        namespace: "auto-dev-2",
        syncedFiles: [
          { path: "spec.md", lastSyncAt: new Date().toISOString() },
        ],
        lastSyncAt: new Date().toISOString(),
      },
      {
        issueNumber: 3,
        namespace: "auto-dev-3",
        syncedFiles: [],
        lastSyncAt: new Date().toISOString(),
      },
    ];
    await saveSyncMappings(tmpDir, mappings);
    const loaded = loadSyncMappings(tmpDir);
    expect(loaded).toHaveLength(3);
    expect(loaded[0].issueNumber).toBe(1);
    expect(loaded[1].syncedFiles).toHaveLength(1);
  });

  it("returns empty array when no file", () => {
    const loaded = loadSyncMappings(tmpDir);
    expect(loaded).toEqual([]);
  });
});

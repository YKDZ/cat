import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { WorkflowRun, DecisionRequest } from "../shared/types.js";

import { DEFAULT_CONFIG } from "../config/types.js";
import { DecisionManager } from "../decision-service/decision-manager.js";
import {
  ensureStateDirs,
  saveWorkflowRun,
  loadWorkflowRun,
  loadDecision,
} from "../state-store/index.js";

let tmpDir: string;
let manager: DecisionManager;

beforeEach(async () => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "integration-"));
  await ensureStateDirs(tmpDir);
  manager = new DecisionManager(tmpDir, {
    ...DEFAULT_CONFIG,
    maxDecisionPerRun: 3,
  });
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
  prNumber: null,
  frontmatterConfig: null,
  ...overrides,
});

const makeRequest = (
  workflowRunId: string,
  overrides: Partial<DecisionRequest> = {},
): DecisionRequest => ({
  id: randomUUID(),
  workflowRunId,
  title: "Integration test decision",
  options: [{ key: "a", label: "A", description: "Option A" }],
  recommendation: "a",
  context: null,
  ...overrides,
});

describe("Full Decision Lifecycle", () => {
  it("persists decision through pending -> resolved -> running", async () => {
    const run = makeRun();
    await saveWorkflowRun(tmpDir, run);

    const request = makeRequest(run.id);
    const receiveResult = await manager.receiveRequest(request);
    expect(receiveResult.accepted).toBe(true);

    const decision = loadDecision(tmpDir, request.id);
    expect(decision!.status).toBe("pending");

    const resolveResponse = await manager.resolve(
      request.id,
      "a",
      "human",
      "cli",
    );
    expect(resolveResponse.resolution).toBe("a");

    const updatedDecision = loadDecision(tmpDir, request.id);
    expect(updatedDecision!.status).toBe("resolved");

    const updatedRun = loadWorkflowRun(tmpDir, run.id);
    expect(updatedRun!.status).toBe("running");
  });

  it("enforces decision limit", async () => {
    const run = makeRun();
    await saveWorkflowRun(tmpDir, run);

    const r1 = makeRequest(run.id);
    const r2 = makeRequest(run.id);
    const r3 = makeRequest(run.id);

    expect((await manager.receiveRequest(r1)).accepted).toBe(true);
    expect((await manager.receiveRequest(r2)).accepted).toBe(true);
    expect((await manager.receiveRequest(r3)).accepted).toBe(true);

    const r4 = makeRequest(run.id);
    const rejected = await manager.receiveRequest(r4);
    expect(rejected.accepted).toBe(false);
    expect(rejected.remainingDecisions).toBe(0);
  });
});

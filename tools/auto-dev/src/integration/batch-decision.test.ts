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
  tmpDir = mkdtempSync(resolve(tmpdir(), "batch-decision-"));
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
  title: "Batch test decision",
  options: [{ key: "a", label: "A", description: "Option A" }],
  recommendation: "a",
  context: null,
  ...overrides,
});

describe("Batch Decision Flow", () => {
  it("accepts up to maxDecisionPerRun and rejects overflow", async () => {
    const run = makeRun();
    await saveWorkflowRun(tmpDir, run);
    const batchId = randomUUID();

    const requests = [
      makeRequest(run.id),
      makeRequest(run.id),
      makeRequest(run.id),
    ];
    const results = await manager.receiveBatch(requests, batchId);
    expect(results.every((r) => r.accepted)).toBe(true);

    // One more batch — should all be rejected
    const overflow = [makeRequest(run.id)];
    const overflowResults = await manager.receiveBatch(overflow, batchId);
    expect(overflowResults.every((r) => !r.accepted)).toBe(true);
    expect(overflowResults[0]?.reason).toBe("Decision limit reached");
  });

  it("assigns sequential aliases to batch decisions", async () => {
    const run = makeRun();
    await saveWorkflowRun(tmpDir, run);
    const batchId = randomUUID();

    const requests = [
      makeRequest(run.id),
      makeRequest(run.id),
      makeRequest(run.id),
    ];
    const results = await manager.receiveBatch(requests, batchId);

    expect(results[0]?.alias).toBe("d1");
    expect(results[1]?.alias).toBe("d2");
    expect(results[2]?.alias).toBe("d3");
  });

  it("resolving one decision in a batch updates pendingDecisionIds", async () => {
    const run = makeRun();
    await saveWorkflowRun(tmpDir, run);
    const batchId = randomUUID();

    const requests = [makeRequest(run.id), makeRequest(run.id)];
    const results = await manager.receiveBatch(requests, batchId);

    const firstId = results[0]!.id;
    await manager.resolve(firstId, "a", "human", "pr_comment");

    const updatedRun = loadWorkflowRun(tmpDir, run.id);
    expect(updatedRun!.pendingDecisionIds).not.toContain(firstId);
    expect(updatedRun!.pendingDecisionIds).toContain(requests[1]!.id);
  });

  it("sets the same batchId on all decisions in a batch", async () => {
    const run = makeRun();
    await saveWorkflowRun(tmpDir, run);
    const batchId = randomUUID();

    const requests = [makeRequest(run.id), makeRequest(run.id)];
    const results = await manager.receiveBatch(requests, batchId);

    for (const result of results) {
      const decision = loadDecision(tmpDir, result.id);
      expect(decision!.batchId).toBe(batchId);
    }
  });

  it("interleaves single and batch decisions with correct aliases", async () => {
    const run = makeRun();
    await saveWorkflowRun(tmpDir, run);

    // Single decision first → d1
    const single = makeRequest(run.id);
    const singleResult = await manager.receiveRequest(single);
    expect(singleResult.alias).toBe("d1");

    // Batch next → d2, d3
    const batchRequests = [makeRequest(run.id), makeRequest(run.id)];
    const batchResults = await manager.receiveBatch(
      batchRequests,
      randomUUID(),
    );
    expect(batchResults[0]?.alias).toBe("d2");
    expect(batchResults[1]?.alias).toBe("d3");
  });
});

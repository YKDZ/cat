import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { WorkflowRun, DecisionRequest } from "../shared/types.js";

import { DEFAULT_CONFIG } from "../config/types.js";
import { DecisionNotFoundError } from "../shared/errors.js";
import {
  ensureStateDirs,
  saveWorkflowRun,
  loadWorkflowRun,
  loadDecision,
} from "../state-store/index.js";
import { DecisionManager } from "./decision-manager.js";

let tmpDir: string;
let manager: DecisionManager;

beforeEach(async () => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "decision-test-"));
  await ensureStateDirs(tmpDir);
  manager = new DecisionManager(tmpDir, DEFAULT_CONFIG);
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

const makeRequest = (
  overrides: Partial<DecisionRequest> = {},
): DecisionRequest => ({
  id: randomUUID(),
  workflowRunId: "test-run-id",
  title: "Test decision",
  options: [{ key: "a", label: "Option A", description: "First option" }],
  recommendation: "a",
  context: null,
  ...overrides,
});

describe("DecisionManager", () => {
  describe("receiveRequest", () => {
    it("creates pending decision", async () => {
      const run = makeRun();
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      const result = await manager.receiveRequest(request);

      expect(result.accepted).toBe(true);

      const decision = loadDecision(tmpDir, request.id);
      expect(decision).not.toBeNull();
      expect(decision!.status).toBe("pending");
    });

    it("updates WorkflowRun status to waiting_decision", async () => {
      const run = makeRun();
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      const updated = loadWorkflowRun(tmpDir, run.id);
      expect(updated!.status).toBe("waiting_decision");
    });

    it("increments decisionCount", async () => {
      const run = makeRun({ decisionCount: 3 });
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      const updated = loadWorkflowRun(tmpDir, run.id);
      expect(updated!.decisionCount).toBe(4);
    });

    it("rejects when limit reached", async () => {
      const run = makeRun({ decisionCount: DEFAULT_CONFIG.maxDecisionPerRun });
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      const result = await manager.receiveRequest(request);

      expect(result.accepted).toBe(false);
      expect(result.remainingDecisions).toBe(0);
    });

    it("returns correct remainingDecisions", async () => {
      const run = makeRun({ decisionCount: 3 });
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      const result = await manager.receiveRequest(request);

      expect(result.accepted).toBe(true);
      expect(result.remainingDecisions).toBe(16);
    });

    it("returns accepted:false for unknown workflow run", async () => {
      const request = makeRequest({ workflowRunId: "nonexistent-run" });
      const result = await manager.receiveRequest(request);
      expect(result.accepted).toBe(false);
    });
  });

  describe("resolve", () => {
    it("updates decision to resolved", async () => {
      const run = makeRun();
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      const response = await manager.resolve(request.id, "a", "human", "cli");

      expect(response.decisionId).toBe(request.id);
      expect(response.resolution).toBe("a");
      expect(response.resolvedBy).toBe("human");

      const decision = loadDecision(tmpDir, request.id);
      expect(decision!.status).toBe("resolved");
    });

    it("returns DecisionResponse with remainingDecisions", async () => {
      const run = makeRun({ decisionCount: 5 });
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      const response = await manager.resolve(request.id, "a", "human", "cli");

      expect(response.decisionId).toBe(request.id);
      expect(response.title).toBe("Test decision");
      expect(response.resolution).toBe("a");
      expect(response.resolvedBy).toBe("human");
      expect(response.remainingDecisions).toBe(14);
    });

    it("sets WorkflowRun status back to running", async () => {
      const run = makeRun();
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      await manager.resolve(request.id, "a", "human", "cli");

      const updated = loadWorkflowRun(tmpDir, run.id);
      expect(updated!.status).toBe("running");
    });

    it("removes decisionId from pendingDecisionIds", async () => {
      const run = makeRun({ pendingDecisionIds: ["other-id"] });
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      await manager.resolve(request.id, "a", "human", "cli");

      const updated = loadWorkflowRun(tmpDir, run.id);
      expect(updated!.pendingDecisionIds).not.toContain(request.id);
      expect(updated!.pendingDecisionIds).toContain("other-id");
    });

    it("throws DecisionNotFoundError for nonexistent ID", async () => {
      await expect(
        manager.resolve("nonexistent-id", "a", "human", "cli"),
      ).rejects.toThrow(DecisionNotFoundError);
    });

    it("is idempotent on already-resolved decision", async () => {
      const run = makeRun();
      await saveWorkflowRun(tmpDir, run);

      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      const response1 = await manager.resolve(request.id, "a", "human", "cli");
      const response2 = await manager.resolve(request.id, "b", "human", "cli");

      expect(response2.resolution).toBe("a");
      expect(response1.decisionId).toBe(response2.decisionId);
    });
  });

  describe("listAll", () => {
    it("returns all decisions", async () => {
      for (let i = 0; i < 3; i += 1) {
        const run = makeRun();
        // eslint-disable-next-line no-await-in-loop
        await saveWorkflowRun(tmpDir, run);
        const request = makeRequest({ workflowRunId: run.id });
        // eslint-disable-next-line no-await-in-loop
        await manager.receiveRequest(request);
      }

      const allDecisions = manager.listAll();
      expect(allDecisions).toHaveLength(3);

      await manager.resolve(allDecisions[0].id, "a", "human", "cli");
      await manager.resolve(allDecisions[1].id, "b", "human", "cli");

      const afterResolve = manager.listAll();
      const resolved = afterResolve.filter((d) => d.status === "resolved");
      const pending = afterResolve.filter((d) => d.status === "pending");
      expect(resolved).toHaveLength(2);
      expect(pending).toHaveLength(1);
    });
  });

  describe("getResolution", () => {
    it("returns null for pending decision", async () => {
      const run = makeRun();
      await saveWorkflowRun(tmpDir, run);
      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      const resolution = await manager.getResolution(request.id);
      expect(resolution).toBeNull();
    });

    it("returns response for resolved decision", async () => {
      const run = makeRun();
      await saveWorkflowRun(tmpDir, run);
      const request = makeRequest({ workflowRunId: run.id });
      await manager.receiveRequest(request);

      await manager.resolve(request.id, "a", "human", "cli");
      const resolution = await manager.getResolution(request.id);

      expect(resolution).not.toBeNull();
      expect(resolution!.resolution).toBe("a");
      expect(resolution!.remainingDecisions).toBe(19);
    });
  });
});

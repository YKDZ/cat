import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { PollResult } from "./issue-poller.js";

import { ensureStateDirs, listWorkflowRuns } from "../state-store/index.js";
import { WorkflowManager } from "./workflow-manager.js";

let tmpDir: string;
let manager: WorkflowManager;

beforeEach(async () => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "wf-test-"));
  await ensureStateDirs(tmpDir);
  manager = new WorkflowManager(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const makePollResult = (issueNumber: number): PollResult => ({
  issueNumber,
  title: `Issue ${issueNumber}`,
  body: "Description",
  labels: [],
  agentDefinition: "full-pipeline",
  agentProvider: null,
  agentModel: null,
  agentEffort: null,
  autoMerge: false,
  permissionMode: null,
  maxTurns: null,
  maxDecisions: null,
  frontmatterConfig: null,
});

describe("WorkflowManager", () => {
  it("createRun assigns correct namespace and branch", async () => {
    const run = await manager.createRun(makePollResult(42), "owner/repo");
    expect(run.namespace).toBe("auto-dev-42");
    expect(run.branch).toBe("auto-dev/issue-42");
    expect(run.issueNumber).toBe(42);
    expect(run.repoFullName).toBe("owner/repo");
  });

  it("createRun sets initial status to pending", async () => {
    const run = await manager.createRun(makePollResult(1), "owner/repo");
    expect(run.status).toBe("pending");
  });

  it("updateStatus changes status", async () => {
    const run = await manager.createRun(makePollResult(1), "owner/repo");
    await manager.updateStatus(run.id, "running");
    const runs = listWorkflowRuns(tmpDir);
    expect(runs[0].status).toBe("running");
  });

  it("updatePhase changes phase", async () => {
    const run = await manager.createRun(makePollResult(1), "owner/repo");
    await manager.updatePhase(run.id, "impl");
    const runs = listWorkflowRuns(tmpDir);
    expect(runs[0].currentPhase).toBe("impl");
  });

  it("listActive excludes completed/failed/desynced", async () => {
    const run1 = await manager.createRun(makePollResult(1), "owner/repo");
    await manager.createRun(makePollResult(2), "owner/repo");
    const run3 = await manager.createRun(makePollResult(3), "owner/repo");

    await manager.updateStatus(run1.id, "completed");
    await manager.updateStatus(run3.id, "failed");

    const active = manager.listActive();
    expect(active).toHaveLength(1);
  });
});

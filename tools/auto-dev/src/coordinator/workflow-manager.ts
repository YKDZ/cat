import { randomUUID } from "node:crypto";

import type {
  WorkflowRun,
  WorkflowStatus,
  WorkflowPhase,
} from "../shared/types.js";
import type { PollResult } from "./issue-poller.js";

import {
  saveWorkflowRun,
  loadWorkflowRun,
  listWorkflowRuns,
} from "../state-store/index.js";

const deriveNamespace = (issueNumber: number): string =>
  `auto-dev-${issueNumber}`;

const deriveBranch = (issueNumber: number): string =>
  `auto-dev/issue-${issueNumber}`;

export class WorkflowManager {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async createRun(
    result: PollResult,
    repoFullName: string,
  ): Promise<WorkflowRun> {
    const now = new Date().toISOString();
    const run: WorkflowRun = {
      id: randomUUID(),
      issueNumber: result.issueNumber,
      repoFullName,
      currentPhase: null,
      status: "pending",
      branch: deriveBranch(result.issueNumber),
      agentProvider: result.agentProvider,
      agentModel: result.agentModel,
      agentEffort: result.agentEffort,
      agentDefinition: result.agentDefinition,
      runId: null,
      namespace: deriveNamespace(result.issueNumber),
      startedAt: now,
      updatedAt: now,
      decisionCount: 0,
      pendingDecisionIds: [],
      prNumber: null,
      frontmatterConfig: result.frontmatterConfig ?? null,
    };

    await saveWorkflowRun(this.workspaceRoot, run);
    return run;
  }

  async updateStatus(runId: string, status: WorkflowStatus): Promise<void> {
    const run = loadWorkflowRun(this.workspaceRoot, runId);
    if (!run) return;

    run.status = status;
    run.updatedAt = new Date().toISOString();
    await saveWorkflowRun(this.workspaceRoot, run);
  }

  async updatePhase(runId: string, phase: WorkflowPhase): Promise<void> {
    const run = loadWorkflowRun(this.workspaceRoot, runId);
    if (!run) return;

    run.currentPhase = phase;
    run.updatedAt = new Date().toISOString();
    await saveWorkflowRun(this.workspaceRoot, run);
  }

  listActive(): WorkflowRun[] {
    return listWorkflowRuns(this.workspaceRoot).filter(
      (r) => !["completed", "failed", "desynced"].includes(r.status),
    );
  }

  listAll(): WorkflowRun[] {
    return listWorkflowRuns(this.workspaceRoot);
  }
}

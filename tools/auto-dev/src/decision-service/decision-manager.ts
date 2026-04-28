import type { AutoDevConfig } from "../config/types.js";
import type {
  DecisionBlock,
  DecisionRequest,
  DecisionResponse,
} from "../shared/types.js";

import { DecisionNotFoundError } from "../shared/errors.js";
import {
  saveDecision,
  loadDecision,
  listDecisions,
  saveWorkflowRun,
  loadWorkflowRun,
} from "../state-store/index.js";

export class DecisionManager {
  private readonly workspaceRoot: string;
  private readonly config: AutoDevConfig;

  constructor(workspaceRoot: string, config: AutoDevConfig) {
    this.workspaceRoot = workspaceRoot;
    this.config = config;
  }

  async receiveRequest(request: DecisionRequest): Promise<{
    accepted: boolean;
    remainingDecisions: number;
  }> {
    const run = loadWorkflowRun(this.workspaceRoot, request.workflowRunId);
    if (!run) {
      return { accepted: false, remainingDecisions: 0 };
    }

    if (run.decisionCount >= this.config.maxDecisionPerRun) {
      return { accepted: false, remainingDecisions: 0 };
    }

    const remaining = this.config.maxDecisionPerRun - run.decisionCount;

    const decision: DecisionBlock = {
      id: request.id,
      workflowRunId: request.workflowRunId,
      title: request.title,
      options: request.options,
      recommendation: request.recommendation,
      context: request.context,
      status: "pending",
      resolution: null,
      resolvedBy: null,
      resolutionChannel: null,
      requestedAt: new Date().toISOString(),
      resolvedAt: null,
      socketConnectionId: null,
    };

    await saveDecision(this.workspaceRoot, decision);

    run.status = "waiting_decision";
    run.decisionCount += 1;
    run.pendingDecisionIds = [...run.pendingDecisionIds, request.id];
    run.updatedAt = new Date().toISOString();
    await saveWorkflowRun(this.workspaceRoot, run);

    return { accepted: true, remainingDecisions: remaining - 1 };
  }

  async resolve(
    decisionId: string,
    choice: string,
    resolvedBy: string,
    channel: "cli" | "issue_comment" = "cli",
  ): Promise<DecisionResponse> {
    const decision = loadDecision(this.workspaceRoot, decisionId);
    if (!decision) {
      throw new DecisionNotFoundError(decisionId);
    }

    if (decision.status === "resolved") {
      const run = loadWorkflowRun(this.workspaceRoot, decision.workflowRunId);
      const remaining = run
        ? this.config.maxDecisionPerRun - run.decisionCount
        : 0;
      return {
        decisionId: decision.id,
        title: decision.title,
        resolution: decision.resolution!,
        resolvedBy: decision.resolvedBy!,
        resolvedAt: decision.resolvedAt!,
        remainingDecisions: remaining,
      };
    }

    const now = new Date().toISOString();

    decision.status = "resolved";
    decision.resolution = choice;
    decision.resolvedBy = resolvedBy;
    decision.resolutionChannel = channel;
    decision.resolvedAt = now;
    await saveDecision(this.workspaceRoot, decision);

    const run = loadWorkflowRun(this.workspaceRoot, decision.workflowRunId);
    if (run) {
      run.status = "running";
      run.pendingDecisionIds = run.pendingDecisionIds.filter(
        (id) => id !== decisionId,
      );
      run.updatedAt = now;
      await saveWorkflowRun(this.workspaceRoot, run);

      const remaining = this.config.maxDecisionPerRun - run.decisionCount;

      return {
        decisionId: decision.id,
        title: decision.title,
        resolution: choice,
        resolvedBy,
        resolvedAt: now,
        remainingDecisions: remaining,
      };
    }

    return {
      decisionId: decision.id,
      title: decision.title,
      resolution: choice,
      resolvedBy,
      resolvedAt: now,
      remainingDecisions: 0,
    };
  }

  listAll(): DecisionBlock[] {
    return listDecisions(this.workspaceRoot);
  }

  async getResolution(decisionId: string): Promise<DecisionResponse | null> {
    const decision = loadDecision(this.workspaceRoot, decisionId);
    if (!decision || decision.status !== "resolved") return null;

    const run = loadWorkflowRun(this.workspaceRoot, decision.workflowRunId);
    const remaining = run
      ? this.config.maxDecisionPerRun - run.decisionCount
      : 0;

    return {
      decisionId: decision.id,
      title: decision.title,
      resolution: decision.resolution!,
      resolvedBy: decision.resolvedBy!,
      resolvedAt: decision.resolvedAt!,
      remainingDecisions: remaining,
    };
  }
}

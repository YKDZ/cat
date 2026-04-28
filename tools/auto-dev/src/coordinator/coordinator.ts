import { randomUUID } from "node:crypto";

import type { AutoDevConfig } from "../config/types.js";
import type { PollResult } from "./issue-poller.js";

import { AgentDispatcher } from "../agent-dispatcher/index.js";
import { AuditLogger } from "../audit-logger/index.js";
import { BranchManager } from "../branch-manager/index.js";
import { loadConfig } from "../config/loader.js";
import { DecisionManager } from "../decision-service/decision-manager.js";
import { DecisionSocketServer } from "../decision-service/socket-server.js";
import {
  createComment,
  listIssueComments,
  removeIssueLabels,
  updateIssueLabels,
} from "../shared/gh-cli.js";
import {
  ensureStateDirs,
  listDecisions,
  loadWorkflowRun,
  saveCoordinatorState,
} from "../state-store/index.js";
import { pollIssues } from "./issue-poller.js";
import { WorkflowManager } from "./workflow-manager.js";

const DEFAULT_SOCKET_PATH = "/var/run/auto-dev.sock";

export class Coordinator {
  private readonly workspaceRoot: string;
  private readonly repoFullName: string;
  private config: AutoDevConfig | null = null;
  private socketServer: DecisionSocketServer | null = null;
  private decisionManager: DecisionManager | null = null;
  private workflowManager: WorkflowManager | null = null;
  private branchManager: BranchManager | null = null;
  private dispatcher: AgentDispatcher | null = null;
  private auditLogger: AuditLogger | null = null;
  private polling = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** runId → issueNumber for active (not yet completed) runs */
  private readonly activeRuns: Map<string, number> = new Map();
  /** GitHub comment node-IDs that have already been processed */
  private readonly processedCommentIds: Set<string> = new Set();
  private commentPollTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly COMMENT_POLL_INTERVAL_MS = 15_000;

  constructor(workspaceRoot: string, repoFullName: string) {
    this.workspaceRoot = workspaceRoot;
    this.repoFullName = repoFullName;
  }

  async start(): Promise<void> {
    this.config = await loadConfig(this.workspaceRoot);
    await ensureStateDirs(this.workspaceRoot);

    this.decisionManager = new DecisionManager(this.workspaceRoot, this.config);
    this.workflowManager = new WorkflowManager(this.workspaceRoot);
    this.branchManager = new BranchManager(
      this.workspaceRoot,
      this.repoFullName,
    );
    this.dispatcher = new AgentDispatcher();
    this.auditLogger = new AuditLogger(this.workspaceRoot);

    this.socketServer = new DecisionSocketServer({
      socketPath: process.env.AUTO_DEV_SOCKET ?? DEFAULT_SOCKET_PATH,
      config: this.config,
      workspaceRoot: this.workspaceRoot,
      onDecisionRequest: async (request) => {
        const result = await this.decisionManager!.receiveRequest(request);
        if (result.accepted) {
          const run = loadWorkflowRun(
            this.workspaceRoot,
            request.workflowRunId,
          );
          if (run) {
            const { alias } = result;
            const optionLines = request.options.map(
              (o) =>
                `- \`${o.key}\`: ${o.label}${o.description ? ` — ${o.description}` : ""}`,
            );
            const lines = [
              `<!-- auto-dev-bot -->`,
              `🤖 **Auto-Dev** needs a decision to continue.`,
              ``,
              `**Decision \`${alias}\`**: ${request.title}`,
              ``,
              `**Options**:`,
              ...optionLines,
              ``,
              `**Recommendation**: \`${request.recommendation}\``,
            ];
            if (request.context) {
              lines.push(
                ``,
                `**Context**:`,
                `> ${request.context.replace(/\n/g, "\n> ")}`,
              );
            }
            lines.push(
              ``,
              `💬 **Reply to this issue** with \`@${alias} <key>\` to resolve, e.g.:`,
              `> @${alias} ${request.recommendation}`,
              ``,
              `Or use CLI: \`auto-dev resolve-decision ${request.id} --choice <key>\``,
              `Remaining decisions this run: ${result.remainingDecisions}`,
            );
            try {
              createComment(
                this.repoFullName,
                run.issueNumber,
                lines.join("\n"),
              );
            } catch {
              /* best-effort */
            }
          }
        }
        return result;
      },
      onGetResolution: async (decisionId) => {
        return this.decisionManager!.getResolution(decisionId);
      },
    });
    await this.socketServer.start();

    await saveCoordinatorState(this.workspaceRoot, {
      startedAt: new Date().toISOString(),
      pollIntervalSec: this.config.pollIntervalSec,
      activeRunIds: [],
    });

    this.polling = true;
    void this.pollLoop();
    this.startCommentPoller();
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        const results = await pollIssues(
          this.repoFullName,
          this.config!,
          this.workspaceRoot,
        );

        // oxlint-disable-next-line no-await-in-loop
        await Promise.all(
          results.map(async (result) => this.handleNewIssue(result)),
        );
      } catch (err) {
        console.error(`[auto-dev] Poll cycle error: ${String(err)}`);
      }

      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        this.pollTimer = setTimeout(
          resolve,
          this.config!.pollIntervalSec * 1000,
        );
      });
    }
  }

  private async handleNewIssue(result: PollResult): Promise<void> {
    const run = await this.workflowManager!.createRun(
      result,
      this.repoFullName,
    );
    console.log(
      `[auto-dev] Claimed issue #${result.issueNumber}, run ${run.id}`,
    );
    this.activeRuns.set(run.id, result.issueNumber);

    // 1. Claim: label + comment
    try {
      updateIssueLabels(this.repoFullName, result.issueNumber, [
        "auto-dev:claimed",
      ]);
      createComment(
        this.repoFullName,
        result.issueNumber,
        `<!-- auto-dev-bot -->
🤖 **Auto-Dev** claimed this issue.\n\nRun ID: \`${run.id}\`\nBranch: \`${run.branch}\`\nAgent: \`${run.agentDefinition ?? this.config!.defaultAgent}\``,
      );
    } catch (err) {
      console.error(
        `[auto-dev] Failed to claim issue #${result.issueNumber}: ${String(err)}`,
      );
    }

    // 2. Create branch + isolated worktree
    let worktreePath: string | null = null;
    try {
      const created = this.branchManager!.createBranch(result.issueNumber);
      worktreePath = created.worktreePath;
      console.log(
        `[auto-dev] Branch ${run.branch} + worktree ${worktreePath} created for issue #${result.issueNumber}`,
      );
    } catch (err) {
      console.error(
        `[auto-dev] Failed to create branch for #${result.issueNumber}: ${String(err)}`,
      );
      await this.workflowManager!.updateStatus(run.id, "failed");
      try {
        removeIssueLabels(this.repoFullName, result.issueNumber, [
          "auto-dev:ready",
          "auto-dev:claimed",
        ]);
      } catch {
        /* best-effort */
      }
      return;
    }

    // 3. Dispatch agent
    await this.workflowManager!.updateStatus(run.id, "running");
    const provider = result.agentProvider ?? "claude-code";
    const agentDef = result.agentDefinition ?? this.config!.defaultAgent;

    const issueContext = [
      `## Issue #${result.issueNumber}: ${result.title}`,
      "",
      result.body,
      "",
      `## Metadata`,
      `- Repo: ${this.repoFullName}`,
      `- Branch: ${run.branch}`,
      `- Run ID: ${run.id}`,
    ].join("\n");

    this.auditLogger!.log({
      id: randomUUID(),
      workflowRunId: run.id,
      timestamp: new Date().toISOString(),
      type: "workflow_started",
      payload: { provider, agentDef },
    });

    try {
      for await (const event of this.dispatcher!.dispatch(provider, {
        systemPrompt: "",
        issueContext,
        agentDefinition: agentDef,
        model: result.agentModel,
        effort: result.agentEffort,
        workspaceRoot: this.workspaceRoot,
        agentWorkdir: worktreePath,
      })) {
        if (event.type === "stdout" && event.data) {
          this.auditLogger!.log({
            id: randomUUID(),
            workflowRunId: run.id,
            timestamp: new Date().toISOString(),
            type: "phase_transition",
            payload: { chunk: event.data.slice(0, 2000) },
          });
        } else if (event.type === "stderr" && event.data) {
          console.error(
            `[auto-dev] agent stderr [${run.id}]: ${event.data.slice(0, 500)}`,
          );
        } else if (event.type === "exit") {
          const code = event.exitCode ?? 0;
          const finalStatus = code === 0 ? "completed" : "failed";
          this.activeRuns.delete(run.id);
          await this.workflowManager!.updateStatus(run.id, finalStatus);
          this.auditLogger!.log({
            id: randomUUID(),
            workflowRunId: run.id,
            timestamp: new Date().toISOString(),
            type: code === 0 ? "workflow_completed" : "workflow_failed",
            payload: { exitCode: code },
          });
          console.log(
            `[auto-dev] Run ${run.id} finished with status=${finalStatus} (exit ${code})`,
          );
          try {
            removeIssueLabels(this.repoFullName, result.issueNumber, [
              "auto-dev:ready",
              "auto-dev:claimed",
            ]);
          } catch {
            /* best-effort */
          }
          try {
            const emoji = code === 0 ? "✅" : "❌";
            const statusLabel = code === 0 ? "completed" : "failed";
            createComment(
              this.repoFullName,
              result.issueNumber,
              `${emoji} **Auto-Dev** workflow **${statusLabel}** (exit ${code}).\n\nRun ID: \`${run.id}\``,
            );
          } catch {
            /* best-effort */
          }
          if (worktreePath) {
            this.branchManager!.removeWorktree(worktreePath);
          }
        }
      }
    } catch (err) {
      console.error(
        `[auto-dev] Agent dispatch error for run ${run.id}: ${String(err)}`,
      );
      this.activeRuns.delete(run.id);
      await this.workflowManager!.updateStatus(run.id, "failed");
      try {
        removeIssueLabels(this.repoFullName, result.issueNumber, [
          "auto-dev:ready",
          "auto-dev:claimed",
        ]);
      } catch {
        /* best-effort */
      }
      if (worktreePath) {
        this.branchManager!.removeWorktree(worktreePath);
      }
    }
  }

  async stop(): Promise<void> {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.commentPollTimer) clearTimeout(this.commentPollTimer);
    await this.socketServer?.stop();
  }

  private startCommentPoller(): void {
    const poll = async () => {
      if (this.activeRuns.size > 0) {
        await Promise.all(
          [...this.activeRuns.entries()].map(async ([runId, issueNumber]) =>
            this.processIssueComments(issueNumber, runId),
          ),
        );
      }
      this.commentPollTimer = setTimeout(
        () => void poll(),
        Coordinator.COMMENT_POLL_INTERVAL_MS,
      );
    };
    this.commentPollTimer = setTimeout(
      () => void poll(),
      Coordinator.COMMENT_POLL_INTERVAL_MS,
    );
  }

  private async processIssueComments(
    issueNumber: number,
    runId: string,
  ): Promise<void> {
    try {
      const comments = listIssueComments(this.repoFullName, issueNumber);

      // Collect new, non-bot comments with their parsed @d<n> <key> matches
      type ResolveTask = {
        decisionId: string;
        choice: string;
        author: string;
        alias: string;
      };
      const tasks: ResolveTask[] = [];
      for (const comment of comments) {
        if (this.processedCommentIds.has(comment.id)) continue;
        this.processedCommentIds.add(comment.id);
        if (comment.body.includes("<!-- auto-dev-bot -->")) continue;
        const matches = [...comment.body.matchAll(/@(d\d+)\s+(\S+)/gi)];
        for (const [, rawAlias, choice] of matches) {
          const alias = rawAlias.toLowerCase();
          const pending = listDecisions(this.workspaceRoot).find(
            (d) =>
              d.workflowRunId === runId &&
              d.alias === alias &&
              d.status === "pending",
          );
          if (pending) {
            tasks.push({
              decisionId: pending.id,
              choice,
              author: comment.author.login,
              alias,
            });
          }
        }
      }

      await Promise.all(
        tasks.map(async ({ decisionId, choice, author, alias }) => {
          try {
            await this.decisionManager!.resolve(
              decisionId,
              choice,
              author,
              "issue_comment",
            );
            console.log(
              `[auto-dev] Resolved ${decisionId} (${alias}) via issue comment by ${author} → ${choice}`,
            );
          } catch {
            /* already resolved or invalid — ignore */
          }
        }),
      );
    } catch (err) {
      console.error(
        `[auto-dev] Comment poll error for issue #${issueNumber}: ${String(err)}`,
      );
    }
  }
}

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AutoDevConfig } from "../config/types.js";
import type { PollResult } from "./issue-poller.js";
import type { WorkflowRun } from "../shared/types.js";

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
  renderClaimComment,
  renderWorkspaceComment,
  renderDecisionComment,
  renderCompletionComment,
  renderIssueCompletionComment,
} from "../shared/comment-templates.js";
import {
  ensureStateDirs,
  listDecisions,
  loadWorkflowRun,
  saveCoordinatorState,
  saveWorkflowRun,
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
  private prTriggerPollTimer: ReturnType<typeof setTimeout> | null = null;

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
          const run = loadWorkflowRun(this.workspaceRoot, request.workflowRunId);
          if (run) {
            const pending = listDecisions(this.workspaceRoot).filter(
              (d) => d.workflowRunId === request.workflowRunId && d.status === "pending",
            );
            const comment = renderDecisionComment(
              pending.map((d) => ({
                alias: d.alias,
                title: d.title,
                options: d.options,
                recommendation: d.recommendation,
                context: d.context,
              })),
              result.remainingDecisions,
            );
            const targetNumber = run.prNumber ?? run.issueNumber;
            try {
              createComment(this.repoFullName, targetNumber, comment);
            } catch {
              /* best-effort */
            }
          }
        }
        return result;
      },
      onBatchDecisionRequest: async (requests, batchId) => {
        const results = await this.decisionManager!.receiveBatch(requests, batchId);
        const runId = requests[0]?.workflowRunId;
        if (runId) {
          const run = loadWorkflowRun(this.workspaceRoot, runId);
          if (run) {
            const pending = listDecisions(this.workspaceRoot).filter(
              (d) => d.workflowRunId === runId && d.status === "pending",
            );
            const comment = renderDecisionComment(
              pending.map((d) => ({
                alias: d.alias,
                title: d.title,
                options: d.options,
                recommendation: d.recommendation,
                context: d.context,
              })),
              this.config!.maxDecisionPerRun - run.decisionCount,
            );
            const targetNumber = run.prNumber ?? run.issueNumber;
            try {
              createComment(this.repoFullName, targetNumber, comment);
            } catch {
              /* best-effort */
            }
          }
        }
        return results;
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
    this.startPRTriggerPoller();
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

    // 1. Claim: label only (comment will be posted after PR creation)
    try {
      updateIssueLabels(this.repoFullName, result.issueNumber, [
        "auto-dev:claimed",
      ]);
    } catch (err) {
      console.error(
        `[auto-dev] Failed to label issue #${result.issueNumber}: ${String(err)}`,
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

    // 3. PR-First: initial commit, push, create PR
    let prNumber: number | null = null;
    try {
      const initFile = resolve(worktreePath, `.auto-dev-init-${run.id}.md`);
      writeFileSync(
        initFile,
        `# Auto-Dev Run ${run.id}\n\nIssue: #${result.issueNumber}\nBranch: ${run.branch}\n`,
      );
      this.branchManager!.commitAndPush(
        run.branch,
        `chore: auto-dev init for issue #${result.issueNumber}`,
        worktreePath,
      );

      const prTitle = result.title;
      const prBody = `Closes #${result.issueNumber}\n\nRun ID: \`${run.id}\``;
      const pr = this.branchManager!.createPR(run.branch, prTitle, prBody, "main");
      prNumber = pr.number;
      run.prNumber = prNumber;
      await saveWorkflowRun(this.workspaceRoot, run);

      console.log(`[auto-dev] PR #${prNumber} created for issue #${result.issueNumber}`);

      try {
        createComment(
          this.repoFullName,
          prNumber,
          renderWorkspaceComment(run, {
            model: result.agentModel,
            effort: result.agentEffort,
            maxDecisions: this.config!.maxDecisionPerRun,
            agentDefinition: result.agentDefinition,
            autoMerge: result.autoMerge,
            issueTitle: result.title,
            issueBody: result.body,
          }),
        );
      } catch (err) {
        console.error(`[auto-dev] Failed to post PR workspace comment: ${String(err)}`);
      }

      try {
        createComment(
          this.repoFullName,
          result.issueNumber,
          renderClaimComment(run, prNumber),
        );
      } catch (err) {
        console.error(`[auto-dev] Failed to post kanban claim comment: ${String(err)}`);
      }

      this.auditLogger!.log({
        id: randomUUID(),
        workflowRunId: run.id,
        timestamp: new Date().toISOString(),
        type: "pr_created",
        payload: { prNumber, branch: run.branch },
      });
    } catch (err) {
      console.error(`[auto-dev] PR creation failed for #${result.issueNumber}: ${String(err)}`);
      try {
        createComment(
          this.repoFullName,
          result.issueNumber,
          `<!-- auto-dev-bot -->\n\nPR creation failed: ${String(err)}. Branch pushed at \`${run.branch}\`.`,
        );
      } catch {
        /* best-effort */
      }
    }
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
            const startedAt = new Date(run.startedAt).getTime();
            const durationSec = Math.round((Date.now() - startedAt) / 1000);
            const duration = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

            if (run.prNumber) {
              let changedFiles = "";
              try {
                const { execSync } = await import("node:child_process");
                changedFiles = execSync("git diff --stat origin/main...HEAD", {
                  encoding: "utf-8",
                  cwd: worktreePath ?? undefined,
                }).trim();
              } catch {
                /* best-effort */
              }

              createComment(
                this.repoFullName,
                run.prNumber,
                renderCompletionComment(
                  run,
                  finalStatus as "completed" | "failed",
                  code,
                  changedFiles,
                  run.decisionCount,
                  result.agentModel,
                  result.agentDefinition,
                  duration,
                ),
              );
              createComment(
                this.repoFullName,
                result.issueNumber,
                renderIssueCompletionComment(
                  run.prNumber,
                  finalStatus as "completed" | "failed",
                ),
              );
            } else {
              const emoji = code === 0 ? "✅" : "❌";
              const statusLabel = code === 0 ? "completed" : "failed";
              createComment(
                this.repoFullName,
                result.issueNumber,
                `${emoji} **Auto-Dev** workflow **${statusLabel}** (exit ${code}).\n\nRun ID: \`${run.id}\``,
              );
            }
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
    if (this.prTriggerPollTimer) clearTimeout(this.prTriggerPollTimer);
    await this.socketServer?.stop();
  }

  private startCommentPoller(): void {
    const poll = async () => {
      if (this.activeRuns.size > 0) {
        await Promise.all(
          [...this.activeRuns.entries()].map(async ([runId, issueNumber]) => {
            await this.processIssueComments(issueNumber, runId);
            const run = loadWorkflowRun(this.workspaceRoot, runId);
            if (run?.prNumber) {
              await this.processPRComments(run.prNumber, runId);
            }
          }),
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

  private collectResolutionTasks(
    comments: { id: string; body: string; user?: { login: string }; author?: { login: string } }[],
    runId: string,
  ): Array<{ decisionId: string; choice: string; author: string; alias: string }> {
    const tasks: Array<{ decisionId: string; choice: string; author: string; alias: string }> = [];
    for (const comment of comments) {
      if (this.processedCommentIds.has(comment.id)) continue;
      this.processedCommentIds.add(comment.id);
      if (comment.body.includes("<!-- auto-dev-bot -->")) continue;
      const matches = [...comment.body.matchAll(/@(d\d+)\s+(\S+)/gi)];
      for (const [, rawAlias, choice] of matches) {
        const alias = rawAlias.toLowerCase();
        const pending = listDecisions(this.workspaceRoot).find(
          (d) => d.workflowRunId === runId && d.alias === alias && d.status === "pending",
        );
        if (pending) {
          tasks.push({
            decisionId: pending.id,
            choice,
            author: (comment.user?.login ?? comment.author?.login) ?? "unknown",
            alias,
          });
        }
      }
    }
    return tasks;
  }

  private async processIssueComments(
    issueNumber: number,
    runId: string,
  ): Promise<void> {
    try {
      const comments = listIssueComments(this.repoFullName, issueNumber);
      const tasks = this.collectResolutionTasks(comments, runId);
      await Promise.all(
        tasks.map(async ({ decisionId, choice, author, alias }) => {
          try {
            await this.decisionManager!.resolve(decisionId, choice, author, "issue_comment");
            console.log(
              `[auto-dev] Resolved ${decisionId} (${alias}) via issue comment by ${author} -> ${choice}`,
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

  private async processPRComments(prNumber: number, runId: string): Promise<void> {
    try {
      const { listPRComments } = await import("../shared/gh-cli.js");
      const comments = listPRComments(this.repoFullName, prNumber);
      const tasks = this.collectResolutionTasks(comments, runId);
      await Promise.all(
        tasks.map(async ({ decisionId, choice, author, alias }) => {
          try {
            await this.decisionManager!.resolve(decisionId, choice, author, "pr_comment");
            console.log(
              `[auto-dev] Resolved ${decisionId} (${alias}) via PR comment by ${author} -> ${choice}`,
            );
          } catch {
            /* ignore */
          }
        }),
      );
    } catch (err) {
      console.error(`[auto-dev] PR comment poll error for PR #${prNumber}: ${String(err)}`);
    }
  }

  private startPRTriggerPoller(): void {
    const poll = async () => {
      try {
        const { listPRs, listPRComments } = await import("../shared/gh-cli.js");
        const prs = listPRs(this.repoFullName, "open");
        const autoDevPRs = prs.filter((pr) => pr.headRefName.startsWith("auto-dev/issue-"));

        for (const pr of autoDevPRs) {
          const comments = listPRComments(this.repoFullName, pr.number);

          for (const comment of comments) {
            if (this.processedCommentIds.has(comment.id)) continue;
            this.processedCommentIds.add(comment.id);

            if (comment.body.includes("<!-- auto-dev-bot -->")) continue;
            const author = (comment.user?.login ?? comment.author?.login) ?? "";
            if (author === "auto-dev[bot]") continue;

            const match = comment.body.match(/@autodev\b/i);
            if (!match) continue;

            const instruction = comment.body.slice(match.index! + "@autodev".length).trim();
            if (!instruction) continue;

            console.log(
              `[auto-dev] PR #${pr.number} trigger detected from @${author}: "${instruction.slice(0, 80)}"`,
            );

            const runs = this.workflowManager!.listAll();
            const run = runs.find((r) => r.prNumber === pr.number);
            if (!run) {
              console.warn(`[auto-dev] No WorkflowRun found for PR #${pr.number}`);
              continue;
            }

            // oxlint-disable-next-line no-await-in-loop
            await this.handlePRTrigger(run, comment.body, pr.number);
            break;
          }
        }
      } catch (err) {
        console.error(`[auto-dev] PR trigger poller error: ${String(err)}`);
      }
      this.prTriggerPollTimer = setTimeout(
        () => void poll(),
        (this.config?.pollIntervalSec ?? 30) * 1000,
      );
    };
    this.prTriggerPollTimer = setTimeout(
      () => void poll(),
      (this.config?.pollIntervalSec ?? 30) * 1000,
    );
  }

  private async handlePRTrigger(
    run: WorkflowRun,
    commentBody: string,
    prNumber: number,
  ): Promise<void> {
    const { parseFrontmatter, stripFrontmatter } = await import(
      "../shared/frontmatter-parser.js"
    );
    const frontmatterConfig = parseFrontmatter(commentBody);

    const agentDefinition = frontmatterConfig?.agent ?? "one-shot-fix";
    const model = frontmatterConfig?.model ?? run.agentModel;
    const effort = frontmatterConfig?.effort ?? run.agentEffort;

    const worktreePath = resolve(
      this.workspaceRoot,
      "tools/auto-dev/worktrees",
      `issue-${run.issueNumber}`,
    );

    const issueContext = [
      `## Re-Trigger on PR #${prNumber}`,
      "",
      `Original Issue: #${run.issueNumber}`,
      `Branch: ${run.branch}`,
      `Run ID: ${run.id}`,
      "",
      "## Instruction",
      "",
      stripFrontmatter(commentBody).trim(),
    ].join("\n");

    console.log(
      `[auto-dev] Dispatching re-trigger agent "${agentDefinition}" for PR #${prNumber}`,
    );

    this.auditLogger!.log({
      id: randomUUID(),
      workflowRunId: run.id,
      timestamp: new Date().toISOString(),
      type: "workflow_started",
      payload: { provider: "claude-code", agentDef: agentDefinition, trigger: "pr_comment" },
    });

    try {
      for await (const event of this.dispatcher!.dispatch("claude-code", {
        systemPrompt: "",
        issueContext,
        agentDefinition,
        model,
        effort,
        workspaceRoot: this.workspaceRoot,
        agentWorkdir: worktreePath,
      })) {
        if (event.type === "exit") {
          console.log(
            `[auto-dev] Re-trigger agent for PR #${prNumber} completed (exit ${event.exitCode})`,
          );
          try {
            createComment(
              this.repoFullName,
              prNumber,
              `<!-- auto-dev-bot -->\n\nRe-trigger completed (exit ${event.exitCode ?? 0}).\nAgent: \`${agentDefinition}\``,
            );
          } catch {
            /* best-effort */
          }
        }
      }
    } catch (err) {
      console.error(`[auto-dev] Re-trigger agent error for PR #${prNumber}: ${String(err)}`);
    }
  }
}

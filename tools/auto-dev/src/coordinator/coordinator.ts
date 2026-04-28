import type { AutoDevConfig } from "../config/types.js";
import { loadConfig } from "../config/loader.js";
import { ensureStateDirs, saveCoordinatorState } from "../state-store/index.js";
import { DecisionSocketServer } from "../decision-service/socket-server.js";
import { DecisionManager } from "../decision-service/decision-manager.js";
import { pollIssues } from "./issue-poller.js";
import { WorkflowManager } from "./workflow-manager.js";
import type { PollResult } from "./issue-poller.js";

const DEFAULT_SOCKET_PATH = "/var/run/auto-dev.sock";

export class Coordinator {
  private readonly workspaceRoot: string;
  private readonly repoFullName: string;
  private config: AutoDevConfig | null = null;
  private socketServer: DecisionSocketServer | null = null;
  private decisionManager: DecisionManager | null = null;
  private workflowManager: WorkflowManager | null = null;
  private polling = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(workspaceRoot: string, repoFullName: string) {
    this.workspaceRoot = workspaceRoot;
    this.repoFullName = repoFullName;
  }

  async start(): Promise<void> {
    this.config = await loadConfig(this.workspaceRoot);
    await ensureStateDirs(this.workspaceRoot);

    this.decisionManager = new DecisionManager(this.workspaceRoot, this.config);
    this.workflowManager = new WorkflowManager(this.workspaceRoot);

    this.socketServer = new DecisionSocketServer({
      socketPath: process.env.AUTO_DEV_SOCKET ?? DEFAULT_SOCKET_PATH,
      config: this.config,
      workspaceRoot: this.workspaceRoot,
      onDecisionRequest: async (request) => {
        return this.decisionManager!.receiveRequest(request);
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
    this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const results = await pollIssues(
          this.repoFullName,
          this.config!,
          this.workspaceRoot,
        );

        for (const result of results) {
          await this.handleNewIssue(result);
        }
      } catch (err) {
        console.error(`[auto-dev] Poll cycle error: ${String(err)}`);
      }

      await new Promise((resolve) => {
        this.pollTimer = setTimeout(resolve, this.config!.pollIntervalSec * 1000);
      });
    }
  }

  private async handleNewIssue(result: PollResult): Promise<void> {
    const run = await this.workflowManager!.createRun(result, this.repoFullName);
    // Branches and agent dispatch will be implemented in later phases
    console.log(`[auto-dev] New run created: ${run.id} for issue #${result.issueNumber}`);
  }

  async stop(): Promise<void> {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    await this.socketServer?.stop();
  }
}

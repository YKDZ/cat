import type { WorkflowPhase } from "../shared/types.js";

export class WorkflowManager {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async createRun(result: any, repoFullName: string): Promise<any> {
    void this.workspaceRoot;
    return null;
  }

  async updateStatus(runId: string, status: any): Promise<void> {
    void this.workspaceRoot;
    void runId;
    void status;
  }

  async updatePhase(runId: string, phase: WorkflowPhase): Promise<void> {
    void this.workspaceRoot;
    void runId;
    void phase;
  }

  listActive(): any[] {
    void this.workspaceRoot;
    return [];
  }

  listAll(): any[] {
    void this.workspaceRoot;
    return [];
  }
}

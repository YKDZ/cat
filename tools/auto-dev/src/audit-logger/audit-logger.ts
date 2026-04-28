import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuditEvent } from "../shared/types.js";

export class AuditLogger {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private getLogDir(runId: string): string {
    return resolve(this.workspaceRoot, "tools/auto-dev/logs", runId);
  }

  private getLogPath(runId: string): string {
    return resolve(this.getLogDir(runId), "audit.jsonl");
  }

  log(event: AuditEvent): void {
    const dir = this.getLogDir(event.workflowRunId);
    mkdirSync(dir, { recursive: true });
    appendFileSync(this.getLogPath(event.workflowRunId), JSON.stringify(event) + "\n");
  }

  read(runId: string): AuditEvent[] {
    const path = this.getLogPath(runId);
    if (!existsSync(path)) return [];
    const content = readFileSync(path, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AuditEvent);
  }
}

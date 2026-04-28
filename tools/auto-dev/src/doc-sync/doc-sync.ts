import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export class DocSync {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async syncToIssue(
    _issueNumber: number,
    _namespace: string,
    _ghCreateComment: (issueNumber: number, body: string) => Promise<void>,
  ): Promise<void> {
    if (existsSync(this.workspaceRoot)) {
      // Placeholder
    }
  }

  async syncFromIssue(issueNumber: number, issueBody: string): Promise<string> {
    const namespace = `auto-dev-${issueNumber}`;
    const dir = resolve(this.workspaceRoot, "todo", namespace);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "issue.md"), issueBody, "utf-8");
    return namespace;
  }

  ensureNamespace(issueNumber: number): string {
    const namespace = `auto-dev-${issueNumber}`;
    const dir = resolve(this.workspaceRoot, "todo", namespace);
    mkdirSync(dir, { recursive: true });
    return namespace;
  }
}

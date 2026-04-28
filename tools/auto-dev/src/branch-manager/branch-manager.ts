import { execSync } from "node:child_process";

const git = (args: string[], cwd: string): string => {
  try {
    return execSync(`git ${args.join(" ")}`, {
      encoding: "utf-8",
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`git error (${args[0]}): ${message}`);
  }
};

export class BranchManager {
  private readonly workspaceRoot: string;
  private readonly repoFullName: string;

  constructor(workspaceRoot: string, repoFullName: string) {
    this.workspaceRoot = workspaceRoot;
    this.repoFullName = repoFullName;
  }

  createBranch(issueNumber: number): string {
    const branch = `auto-dev/issue-${issueNumber}`;
    git(["checkout", "main"], this.workspaceRoot);
    git(["pull", "origin", "main"], this.workspaceRoot);
    git(["checkout", "-b", branch], this.workspaceRoot);
    return branch;
  }

  commitAndPush(branch: string, message: string): void {
    git(["add", "-A"], this.workspaceRoot);
    git(["commit", "-m", message], this.workspaceRoot);
    git(["push", "-u", "origin", branch], this.workspaceRoot);
  }

  createPR(
    branch: string,
    title: string,
    body: string,
    base = "main",
  ): { number: number; url: string } {
    const output = execSync(
      `gh pr create --repo ${this.repoFullName} --base ${base} --head ${branch} --title "${title}" --body "${body}"`,
      { encoding: "utf-8", cwd: this.workspaceRoot },
    ).trim();
    const match = output.match(/\/pull\/(\d+)/);
    return { number: match ? parseInt(match[1], 10) : 0, url: output };
  }

  mergePR(prNumber: number, method: "merge" | "squash" | "rebase" = "merge"): void {
    execSync(
      `gh pr merge ${prNumber} --${method} --repo ${this.repoFullName}`,
      { encoding: "utf-8", cwd: this.workspaceRoot },
    );
  }

  rebaseOntoMain(branch: string): void {
    git(["fetch", "origin", "main"], this.workspaceRoot);
    git(["rebase", "origin/main"], this.workspaceRoot);
  }

  isClean(): boolean {
    const status = git(["status", "--porcelain"], this.workspaceRoot);
    return status === "";
  }

  hasConflicts(): boolean {
    try {
      const diff = git(
        ["diff", "--name-only", "--diff-filter=U"],
        this.workspaceRoot,
      );
      return diff !== "";
    } catch {
      return false;
    }
  }
}

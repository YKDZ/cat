import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const git = (args: string[], cwd: string): string => {
  try {
    return execFileSync("git", args, {
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

  createBranch(issueNumber: number): { branch: string; worktreePath: string } {
    const branch = `auto-dev/issue-${issueNumber}`;
    const worktreePath = resolve(
      this.workspaceRoot,
      "tools/auto-dev/worktrees",
      `issue-${issueNumber}`,
    );

    // Fetch without touching the main working tree
    git(["fetch", "origin", "main"], this.workspaceRoot);

    // Create branch pointing at origin/main — delete first if it already exists
    // (e.g. from a previously failed run)
    try {
      git(["branch", "-D", branch], this.workspaceRoot);
    } catch {
      /* branch didn't exist, that's fine */
    }
    git(["branch", branch, "origin/main"], this.workspaceRoot);

    // Remove stale worktree path if it already exists
    try {
      git(["worktree", "remove", "--force", worktreePath], this.workspaceRoot);
    } catch {
      /* no stale worktree, that's fine */
    }
    // Isolated worktree — completely separate from the main working tree
    git(["worktree", "add", worktreePath, branch], this.workspaceRoot);

    return { branch, worktreePath };
  }

  removeWorktree(worktreePath: string): void {
    try {
      git(["worktree", "remove", "--force", worktreePath], this.workspaceRoot);
    } catch {
      // best-effort cleanup
    }
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
    const output = execFileSync(
      "gh",
      [
        "pr",
        "create",
        "--repo",
        this.repoFullName,
        "--base",
        base,
        "--head",
        branch,
        "--title",
        title,
        "--body",
        body,
      ],
      { encoding: "utf-8", cwd: this.workspaceRoot },
    ).trim();
    const match = output.match(/\/pull\/(\d+)/);
    return { number: match ? parseInt(match[1], 10) : 0, url: output };
  }

  mergePR(
    prNumber: number,
    method: "merge" | "squash" | "rebase" = "merge",
  ): void {
    execFileSync(
      "gh",
      [
        "pr",
        "merge",
        String(prNumber),
        `--${method}`,
        "--repo",
        this.repoFullName,
      ],
      { encoding: "utf-8", cwd: this.workspaceRoot },
    );
  }

  rebaseOntoMain(_branch: string): void {
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

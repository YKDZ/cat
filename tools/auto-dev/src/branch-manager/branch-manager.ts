import { execFileSync, execSync } from "node:child_process";
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

  private fetchWithRetry(): void {
    const delaysSec = [1, 2, 4];
    let lastError: Error | null = null;

    for (let i = 0; i <= delaysSec.length; i += 1) {
      try {
        git(["fetch", "origin", "main"], this.workspaceRoot);
        git(["rev-parse", "--verify", "origin/main"], this.workspaceRoot);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (i < delaysSec.length) {
          console.warn(
            `[auto-dev] git fetch origin main failed (attempt ${i + 1}/3): ${lastError.message}. Retrying in ${delaysSec[i]}s...`,
          );
          execSync(`sleep ${delaysSec[i]}`);
        }
      }
    }
    throw new Error(
      `Failed to fetch origin/main after 3 retries: ${lastError?.message ?? "unknown error"}`,
    );
  }

  createBranch(issueNumber: number): { branch: string; worktreePath: string } {
    const branch = `auto-dev/issue-${issueNumber}`;
    const worktreePath = resolve(
      this.workspaceRoot,
      "tools/auto-dev/worktrees",
      `issue-${issueNumber}`,
    );

    // Fetch without touching the main working tree
    this.fetchWithRetry();

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

  commitAndPush(branch: string, message: string, cwd?: string): void {
    const dir = cwd ?? this.workspaceRoot;
    git(["add", "-A"], dir);
    git(["commit", "-m", message], dir);
    git(["push", "-u", "origin", branch], dir);
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

  verifyBranchSource(issueNumber: number): { branch: string; mergeBase: string } {
    const branch = `auto-dev/issue-${issueNumber}`;
    const mergeBase = git(["merge-base", branch, "origin/main"], this.workspaceRoot);
    const mainHead = git(["rev-parse", "origin/main"], this.workspaceRoot);
    if (mergeBase !== mainHead) {
      throw new Error(
        `Branch ${branch} was NOT created from current origin/main.\n` +
        `  merge-base: ${mergeBase.slice(0, 8)}\n  origin/main: ${mainHead.slice(0, 8)}`,
      );
    }
    return { branch, mergeBase };
  }

  updateRemoteAuth(token: string): void {
    const repo = process.env.GITHUB_REPOSITORY ?? this.repoFullName;
    execSync(
      `git remote set-url origin https://x-access-token:${token}@github.com/${repo}.git`,
      { cwd: this.workspaceRoot },
    );
  }
}

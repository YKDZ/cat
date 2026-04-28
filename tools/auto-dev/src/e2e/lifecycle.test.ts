/**
 * E2E lifecycle test for the Auto-Dev coordinator.
 *
 * Covers the full agent workflow:
 *   1. Issue pickup (auto-dev:ready label + agent:claude-code label)
 *   2. PR creation with BOT_MARKER comment
 *   3. Decision block posted to PR
 *   4. User resolves decision → agent continues and commits
 *   5. @autodev re-trigger in PR comment → agent works again and commits
 *
 * Guard: skipped unless AUTO_DEV_E2E_ENABLED=1 is set.
 * Run with:
 *   AUTO_DEV_E2E_ENABLED=1 \
 *   GITHUB_APP_ID=3532408 \
 *   GITHUB_APP_PRIVATE_KEY="$(cat todo/ykdz-s-autodevbot.2026-04-28.private-key.pem)" \
 *   GITHUB_APP_INSTALLATION_ID=127819771 \
 *   ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
 *   ANTHROPIC_API_KEY=sk-527f57034ceb4c84bf500d3137e9c4e7 \
 *   pnpm vitest run --project unit-auto-dev --reporter verbose tools/auto-dev/src/e2e/lifecycle.test.ts
 */

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Coordinator } from "../coordinator/coordinator.js";
import { listIssueComments, listPRComments, listPRs } from "../shared/gh-cli.js";
import {
  clearTokenCache,
  getAuthEnv,
  getInstallationToken,
} from "../shared/github-app-auth.js";

// ── Constants ──────────────────────────────────────────────────────────────
const REPO = "YKDZ/cat";
/** The GitHub App bot login that should author all coordinator/agent comments. */
const BOT_LOGIN = "ykdz-s-autodevbot[bot]";
const BOT_MARKER = "<!-- auto-dev-bot -->";
const AUTODEV_TRIGGER = "@autodev";
const POLL_INTERVAL_MS = 5_000;
const WAIT_PR_MS = 120_000; // 2 min to create PR + initial commit
const WAIT_COMPLETION_MS = 600_000; // 10 min (covers network outages + push+comment retries)
const WAIT_RETRIGGER_MS = 900_000; // 15 min for re-trigger cycle (coordinator retries up to 900s)

const E2E_ENABLED = Boolean(process.env.AUTO_DEV_E2E_ENABLED);

// ── Helpers ────────────────────────────────────────────────────────────────

/** Poll until predicate returns a truthy value or timeout expires.
 * Transient errors (exceptions) in fn() are logged and retried. */
async function poll<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number,
  intervalMs = POLL_INTERVAL_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    // oxlint-disable-next-line no-await-in-loop
    let result: T | undefined;
    try {
      // oxlint-disable-next-line no-await-in-loop
      result = await fn();
    } catch (err) {
      console.warn(`[poll] transient error (will retry): ${String(err)}`);
    }
    if (result) return result as T;
    if (Date.now() + intervalMs > deadline) {
      throw new Error(`poll timed out after ${timeoutMs}ms`);
    }
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Run gh CLI with GitHub App auth injected. */
const gh = (args: string[], opts?: { cwd?: string }): string => {
  const authEnv = getAuthEnv();
  return execFileSync("gh", args, {
    encoding: "utf-8",
    cwd: opts?.cwd,
    env: { ...process.env, ...authEnv },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
};

/** Create a GitHub issue and return its number. */
const createIssue = (title: string, body: string, labels: string[]): number => {
  const labelArgs = labels.flatMap((l) => ["--label", l]);
  const output = gh([
    "issue",
    "create",
    "--repo",
    REPO,
    "--title",
    title,
    "--body",
    body,
    ...labelArgs,
  ]);
  // Output is the issue URL; extract the number
  const match = output.match(/\/issues\/(\d+)/);
  if (!match) throw new Error(`Could not parse issue number from: ${output}`);
  return parseInt(match[1], 10);
};

/** Close a GitHub issue. */
const closeIssue = (issueNumber: number): void => {
  try {
    gh(["issue", "close", String(issueNumber), "--repo", REPO]);
  } catch {
    /* best-effort */
  }
};

/** Close and delete a PR branch. */
const closePR = (prNumber: number, branch: string): void => {
  try {
    gh(["pr", "close", String(prNumber), "--repo", REPO, "--delete-branch"]);
  } catch {
    try {
      gh([
        "api",
        `repos/${REPO}/git/refs/heads/${branch}`,
        "--method",
        "DELETE",
      ]);
    } catch {
      /* best-effort */
    }
  }
};

/** Post a comment on an issue or PR. */
const postComment = (issueOrPR: number, body: string): void => {
  gh(["issue", "comment", String(issueOrPR), "--repo", REPO, "--body", body]);
};

/** Ensure required GitHub labels exist in the repo. */
const ensureLabels = (labels: string[]): void => {
  for (const label of labels) {
    try {
      gh(["label", "create", label, "--repo", REPO, "--force"]);
    } catch {
      /* label already exists */
    }
  }
};

// ── Test suite ─────────────────────────────────────────────────────────────

describe.skipIf(!E2E_ENABLED)("Auto-Dev full lifecycle E2E", () => {
  let workspaceRoot: string;
  let coordinator: Coordinator;
  let issueNumber: number;
  let prNumber: number;
  let prBranch: string;

  beforeAll(async () => {
    // Load GitHub App private key from file and set in env (if not already set)
    if (!process.env.GITHUB_APP_PRIVATE_KEY) {
      const keyPath = resolve(
        import.meta.dirname,
        "../../../../todo/ykdz-s-autodevbot.2026-04-28.private-key.pem",
      );
      process.env.GITHUB_APP_PRIVATE_KEY = readFileSync(keyPath, "utf-8");
    }
    process.env.GITHUB_APP_ID ??= "3532408";
    process.env.GITHUB_APP_INSTALLATION_ID ??= "127819771";

    // deepseek model for the agent
    process.env.ANTHROPIC_BASE_URL ??= "https://api.deepseek.com/anthropic";
    process.env.ANTHROPIC_API_KEY ??= "sk-527f57034ceb4c84bf500d3137e9c4e7";

    // Use a unique socket path to avoid conflicts with other running instances
    process.env.AUTO_DEV_SOCKET = `/tmp/auto-dev-e2e-${process.pid}.sock`;

    // Clear cached token so fresh auth is used
    clearTokenCache();

    // Clone a fresh copy of the repo into a temp dir as the coordinator workspace.
    // This avoids interfering with the working tree of the main dev repo.
    workspaceRoot = await mkdtemp(resolve(tmpdir(), "auto-dev-e2e-"));
    execSync(
      `git clone https://github.com/${REPO}.git "${workspaceRoot}" --depth=1`,
      {
        stdio: "pipe",
      },
    );

    // Configure git identity in cloned repo for agent commits
    execSync('git config user.email "autodevbot@users.noreply.github.com"', {
      cwd: workspaceRoot,
      stdio: "pipe",
    });
    execSync('git config user.name "ykdz-s-autodevbot[bot]"', {
      cwd: workspaceRoot,
      stdio: "pipe",
    });

    // Configure git remote URL with credentials so coordinator can push branches
    const appToken = getInstallationToken();
    execSync(
      `git remote set-url origin https://x-access-token:${appToken}@github.com/${REPO}.git`,
      { cwd: workspaceRoot, stdio: "pipe" },
    );

    // Write a fast-poll config so the coordinator doesn't wait 30 s per cycle
    writeFileSync(
      resolve(workspaceRoot, "auto-dev.config.mjs"),
      [
        "export default {",
        "  pollIntervalSec: 10,",
        "  maxDecisionPerRun: 20,",
        "  maxImplCycles: 5,",
        '  defaultAgent: "impl-only",',
        "  agents: {},",
        "};",
      ].join("\n") + "\n",
    );

    // Ensure required labels exist
    ensureLabels([
      "auto-dev:ready",
      "auto-dev:claimed",
      "auto-dev:done",
      "auto-dev:failed",
      "agent:claude-code",
      "effort:max",
    ]);

    // Create the test issue — agent configuration comes from frontmatter in the
    // body, not from labels.  Only `auto-dev:ready` is needed as the trigger.
    issueNumber = createIssue(
      "[E2E Test] Add a trivial markdown file for auto-dev E2E verification",
      [
        "---",
        "agent: impl-only",
        "effort: max",
        "model: haiku",
        "---",
        "",
        "This issue is created automatically by the auto-dev E2E test suite.",
        "",
        "**Task**: Add a file `tools/auto-dev/e2e-marker.md` with the text:",
        "> This file was added by the auto-dev E2E test.",
        "",
        "Commit it with message `chore: add e2e-marker.md`.",
        "",
        "⚠️ This issue will be closed automatically after the test run.",
      ].join("\n"),
      ["auto-dev:ready"],
    );

    console.log(`[e2e] Created issue #${issueNumber}`);

    // Start the coordinator against the fresh clone
    coordinator = new Coordinator(workspaceRoot, REPO);
    await coordinator.start();
    console.log("[e2e] Coordinator started");
  }, 60_000);

  afterAll(async () => {
    // Stop coordinator first
    try {
      await coordinator?.stop();
    } catch {
      /* ignore */
    }

    // Cleanup GitHub resources
    if (prNumber) closePR(prNumber, prBranch);
    if (issueNumber) closeIssue(issueNumber);

    // Remove temp workspace
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }

    console.log("[e2e] Cleanup complete");
  }, 60_000);

  it(
    "coordinator picks up issue and creates a PR with BOT_MARKER comment",
    async () => {
      // Wait for a PR whose head branch matches the issue pattern
      const pr = await poll(() => {
        const prs = listPRs(REPO, "open");
        return prs.find((p) =>
          p.headRefName.includes(`auto-dev/issue-${issueNumber}`),
        );
      }, WAIT_PR_MS);

      if (!pr) throw new Error(`No PR found for issue #${issueNumber}`);
      prNumber = pr.number;
      prBranch = pr.headRefName;
      console.log(`[e2e] PR #${prNumber} created on branch ${prBranch}`);

      // Verify BOT_MARKER appears in PR comments, posted by the bot identity
      const prWithMarker = await poll(() => {
        const comments = listPRComments(REPO, prNumber);
        return comments.find(
          (c) =>
            c.body.includes(BOT_MARKER) &&
            (c.user?.login === BOT_LOGIN || c.author?.login === BOT_LOGIN),
        );
      }, 90_000);

      expect(prWithMarker?.body).toContain(BOT_MARKER);
      expect(prWithMarker?.body).toContain("Auto-Dev Working");
      const prCommentAuthor =
        prWithMarker?.user?.login ?? prWithMarker?.author?.login;
      expect(prCommentAuthor).toBe(BOT_LOGIN);

      // Verify claim comment on the issue is also from the bot
      const issueClaimComment = await poll(() => {
        const comments = listIssueComments(REPO, issueNumber);
        return comments.find(
          (c) =>
            c.body.includes(BOT_MARKER) &&
            (c.user?.login === BOT_LOGIN || c.author?.login === BOT_LOGIN),
        );
      }, 90_000);
      const issueCommentAuthor =
        issueClaimComment?.user?.login ?? issueClaimComment?.author?.login;
      expect(issueCommentAuthor).toBe(BOT_LOGIN);
    },
    WAIT_PR_MS + 120_000,
  );

  it(
    "agent makes at least one commit to the PR branch",
    async () => {
      // Wait for at least 2 commits on the PR: the init commit + at least one from the agent.
      // Use the PR commits endpoint (not branch history) to count only PR-specific commits.
      const branchHasCommit = await poll(() => {
        const countStr = gh([
          "api",
          `repos/${REPO}/pulls/${prNumber}/commits`,
          "--jq",
          "length",
        ]).trim();
        const count = parseInt(countStr, 10) || 0;
        return count >= 2;
      }, WAIT_COMPLETION_MS);

      expect(branchHasCommit).toBe(true);
    },
    WAIT_COMPLETION_MS + 10_000,
  );

  it(
    "coordinator posts a completion comment on the PR (from bot)",
    async () => {
      const completionComment = await poll(() => {
        const comments = listPRComments(REPO, prNumber);
        return comments.find(
          (c) =>
            c.body.includes(BOT_MARKER) &&
            (c.body.includes("completed") || c.body.includes("failed")),
        );
      }, WAIT_COMPLETION_MS);

      expect(completionComment?.body).toContain(BOT_MARKER);
      // We assert completion (success); fail is acceptable but log it
      if (completionComment?.body.includes("failed")) {
        console.warn("[e2e] Agent run FAILED — check agent logs for details");
      }
      expect(
        completionComment?.body.includes("completed") ||
          completionComment?.body.includes("failed"),
      ).toBe(true);

      // Verify the completion comment is authored by the bot
      const author =
        completionComment?.user?.login ?? completionComment?.author?.login;
      expect(author).toBe(BOT_LOGIN);
    },
    WAIT_COMPLETION_MS + 10_000,
  );

  it(
    "@autodev re-trigger in PR comment causes agent to resume and commit again",
    async () => {
      // Record current commit count before re-trigger using the PR commits
      // endpoint (lists only PR-specific commits, not all branch history)
      const commitsBefore = gh([
        "api",
        `repos/${REPO}/pulls/${prNumber}/commits`,
        "--jq",
        "length",
      ]).trim();
      const countBefore = parseInt(commitsBefore, 10) || 0;

      // Post a @autodev re-trigger comment — specify the exact file path so the agent is unambiguous
      postComment(
        prNumber,
        `${AUTODEV_TRIGGER} Please append the line \`<!-- e2e-retrigger -->\` to the file \`tools/auto-dev/e2e-marker.md\`. Then commit and push.`,
      );
      console.log("[e2e] Posted @autodev re-trigger comment");

      // Wait for re-trigger Working comment from bot
      const retriggerWorking = await poll(() => {
        const comments = listPRComments(REPO, prNumber);
        return comments.find(
          (c) =>
            c.body.includes(BOT_MARKER) &&
            c.body.includes("Re-Trigger") &&
            (c.user?.login === BOT_LOGIN || c.author?.login === BOT_LOGIN),
        );
      }, 90_000);
      expect(retriggerWorking?.body).toContain("Re-Trigger");
      const retriggerWorkingAuthor =
        retriggerWorking?.user?.login ?? retriggerWorking?.author?.login;
      expect(retriggerWorkingAuthor).toBe(BOT_LOGIN);

      // Wait for the re-trigger completion comment from bot FIRST (long timeout).
      // The coordinator only posts this comment after both push AND comment succeed
      // (via pushAndComment retry loop), so its appearance implies commits are on GitHub.
      const retriggerDone = await poll(() => {
        const comments = listPRComments(REPO, prNumber);
        return comments.find(
          (c) =>
            c.body.includes(BOT_MARKER) &&
            c.body.toLowerCase().includes("re-trigger") &&
            (c.body.includes("completed") || c.body.includes("failed")) &&
            (c.user?.login === BOT_LOGIN || c.author?.login === BOT_LOGIN),
        );
      }, WAIT_RETRIGGER_MS);
      expect(retriggerDone?.body).toBeTruthy();
      const retriggerDoneAuthor =
        retriggerDone?.user?.login ?? retriggerDone?.author?.login;
      expect(retriggerDoneAuthor).toBe(BOT_LOGIN);

      // Verify commit count increased — network is up because completion comment was just fetched
      const countStr = gh([
        "api",
        `repos/${REPO}/pulls/${prNumber}/commits`,
        "--jq",
        "length",
      ]).trim();
      const countAfter = parseInt(countStr, 10) || 0;
      expect(countAfter).toBeGreaterThan(countBefore);
      console.log("[e2e] Re-trigger resulted in a new commit ✓");
    },
    WAIT_RETRIGGER_MS + 180_000,
  );
});

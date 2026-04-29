import { describe, it, expect } from "vitest";

import type { WorkflowRun } from "./types.js";

import {
  renderClaimComment,
  renderWorkspaceComment,
  renderDecisionComment,
  renderCompletionComment,
  renderIssueCompletionComment,
} from "./comment-templates.js";

const BOT_MARKER = "<!-- auto-dev-bot -->";

const makeRun = (): WorkflowRun => ({
  id: "run-abc123",
  issueNumber: 42,
  repoFullName: "owner/repo",
  currentPhase: null,
  status: "running",
  branch: "auto-dev/issue-42",
  agentProvider: null,
  agentModel: null,
  agentEffort: null,
  agentDefinition: null,
  runId: null,
  namespace: null,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  decisionCount: 0,
  pendingDecisionIds: [],
  prNumber: 7,
  frontmatterConfig: null,
});

describe("comment-templates", () => {
  it("renderClaimComment includes PR number and run ID", () => {
    const run = makeRun();
    const result = renderClaimComment(run, 7);
    expect(result).toContain("PR #7");
    expect(result).toContain(run.id);
    expect(result).toContain(BOT_MARKER);
  });

  it("renderWorkspaceComment includes <details> blocks for config and task", () => {
    const run = makeRun();
    const result = renderWorkspaceComment(run, {
      model: "claude-3-5-sonnet",
      effort: "high",
      maxDecisions: 20,
      agentDefinition: "full-pipeline",
      autoMerge: false,
      issueTitle: "Fix bug",
      issueBody: "Detailed description of the bug",
    });
    expect(result).toContain(BOT_MARKER);
    expect(result).toContain("<details>");
    expect(result).toContain("<summary>Configuration</summary>");
    expect(result).toContain("<summary>Task Summary</summary>");
    expect(result).toContain("claude-3-5-sonnet");
    expect(result).toContain(run.id);
  });

  it("renderDecisionComment includes one <details> per decision", () => {
    const decisions = [
      {
        alias: "d1",
        title: "Choose strategy",
        options: [
          { key: "a", label: "Option A", description: "First option" },
          { key: "b", label: "Option B", description: "Second option" },
        ],
        recommendation: "a",
        context: "Some context",
      },
      {
        alias: "d2",
        title: "Pick approach",
        options: [{ key: "x", label: "X", description: "" }],
        recommendation: "x",
        context: null,
      },
    ];
    const result = renderDecisionComment(decisions, 5);
    expect(result).toContain(BOT_MARKER);
    expect(result.match(/<details>/g)).toHaveLength(2);
    expect(result).toContain("d1: Choose strategy");
    expect(result).toContain("d2: Pick approach");
    expect(result).toContain("Remaining decisions this run: 5");
  });

  it("renderDecisionComment handles empty context gracefully", () => {
    const decisions = [
      {
        alias: "d1",
        title: "No context decision",
        options: [{ key: "yes", label: "Yes", description: "" }],
        recommendation: "yes",
        context: null,
      },
    ];
    const result = renderDecisionComment(decisions, 3);
    expect(result).toContain("d1");
    expect(result).not.toContain("**Context**:");
  });

  it("renderCompletionComment includes config and changed-files details blocks", () => {
    const run = makeRun();
    const result = renderCompletionComment(
      run,
      "completed",
      0,
      "src/foo.ts | 5 += 1",
      2,
      "gpt-4o",
      "full-pipeline",
      "1m 30s",
    );
    expect(result).toContain(BOT_MARKER);
    expect(result).toContain("<summary>Configuration</summary>");
    expect(result).toContain("<summary>Changed Files</summary>");
    expect(result).toContain("src/foo.ts");
  });

  it("renderCompletionComment omits changed-files block when empty", () => {
    const run = makeRun();
    const result = renderCompletionComment(
      run,
      "failed",
      1,
      "",
      0,
      null,
      null,
      "0m 5s",
    );
    expect(result).not.toContain("Changed Files");
  });

  it("renderIssueCompletionComment is kanban-style minimal with PR link", () => {
    const result = renderIssueCompletionComment(7, "completed");
    expect(result).toContain(BOT_MARKER);
    expect(result).toContain("PR #7");
    expect(result).toContain("completed");
  });

  it("all templates include the bot marker", () => {
    const run = makeRun();
    expect(renderClaimComment(run, 1)).toContain(BOT_MARKER);
    expect(
      renderWorkspaceComment(run, {
        model: null,
        effort: null,
        maxDecisions: 5,
        agentDefinition: null,
        autoMerge: false,
        issueTitle: "T",
        issueBody: "B",
      }),
    ).toContain(BOT_MARKER);
    expect(
      renderDecisionComment(
        [
          {
            alias: "d1",
            title: "T",
            options: [],
            recommendation: "a",
            context: null,
          },
        ],
        0,
      ),
    ).toContain(BOT_MARKER);
    expect(
      renderCompletionComment(run, "completed", 0, "", 0, null, null, "0m"),
    ).toContain(BOT_MARKER);
    expect(renderIssueCompletionComment(1, "failed")).toContain(BOT_MARKER);
  });
});

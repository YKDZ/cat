import type { WorkflowRun } from "./types.js";

const BOT_MARKER = "<!-- auto-dev-bot -->";

/** Issue kanban-style claim comment -- minimal. */
export const renderClaimComment = (run: WorkflowRun, prNumber: number): string =>
  [
    BOT_MARKER,
    "",
    `Auto-Dev claimed this issue. Working in PR #${prNumber}.`,
    "",
    `**Run ID**: \`${run.id}\``,
  ].join("\n");

/** PR workspace comment -- detailed, posted after PR creation before agent dispatch. */
export const renderWorkspaceComment = (
  run: WorkflowRun,
  config: {
    model: string | null;
    effort: string | null;
    maxDecisions: number;
    agentDefinition: string | null;
    autoMerge: boolean;
    issueTitle: string;
    issueBody: string;
  },
): string => {
  const bodySnippet =
    config.issueBody.length > 500 ? config.issueBody.slice(0, 500) + "..." : config.issueBody;
  return [
    BOT_MARKER,
    "",
    "## Auto-Dev Working",
    "",
    `**Run ID**: \`${run.id}\``,
    `**Branch**: \`${run.branch}\``,
    `**Agent**: \`${config.agentDefinition ?? "default"}\``,
    "",
    "<details>",
    "<summary>Configuration</summary>",
    "",
    "| Setting       | Value      |",
    "| ------------- | ---------- |",
    `| Model         | \`${config.model ?? "default"}\` |`,
    `| Effort        | \`${config.effort ?? "default"}\` |`,
    `| Max decisions | ${config.maxDecisions} |`,
    `| Auto-merge    | ${config.autoMerge ? "yes" : "no"} |`,
    "",
    "</details>",
    "",
    "<details>",
    "<summary>Task Summary</summary>",
    "",
    bodySnippet,
    "",
    "</details>",
  ].join("\n");
};

/** Consolidated decision comment on the PR -- one <details> per decision. */
export const renderDecisionComment = (
  decisions: Array<{
    alias: string;
    title: string;
    options: Array<{ key: string; label: string; description: string }>;
    recommendation: string;
    context: string | null;
  }>,
  remainingCount: number,
): string => {
  const count = decisions.length;
  const header = `**Auto-Dev** needs decisions to continue (${count} pending).`;
  const blocks = decisions.map((d) => {
    const optionLines = d.options.map(
      (o) => `- \`${o.key}\`: ${o.label}${o.description ? ` -- ${o.description}` : ""}`,
    );
    const ctx = d.context
      ? `\n**Context**:\n> ${d.context.replace(/\n/g, "\n> ")}\n`
      : "";
    return [
      "<details>",
      `<summary>${d.alias}: ${d.title}</summary>`,
      "",
      "**Options**:",
      "",
      ...optionLines,
      "",
      `**Recommendation**: \`${d.recommendation}\``,
      ctx,
      `Reply \`@${d.alias} ${d.recommendation}\` to resolve.`,
      "",
      "</details>",
    ].join("\n");
  });
  return [
    BOT_MARKER,
    "",
    header,
    "",
    blocks.join("\n\n"),
    "",
    `Remaining decisions this run: ${remainingCount}`,
  ].join("\n");
};

/** PR completion comment -- detailed with changed files. */
export const renderCompletionComment = (
  run: WorkflowRun,
  status: "completed" | "failed",
  exitCode: number,
  changedFiles: string,
  decisionCount: number,
  model: string | null,
  agentDefinition: string | null,
  duration: string,
): string =>
  [
    BOT_MARKER,
    "",
    "## Auto-Dev Workflow Complete",
    "",
    `**Status**: ${status}`,
    `**Run ID**: \`${run.id}\``,
    `**Duration**: ${duration}`,
    "",
    "<details>",
    "<summary>Configuration</summary>",
    "",
    "| Setting        | Value                |",
    "| -------------- | -------------------- |",
    `| Model          | \`${model ?? "default"}\` |`,
    `| Agent          | \`${agentDefinition ?? "default"}\` |`,
    `| Decisions made | ${decisionCount} |`,
    "",
    "</details>",
    "",
    ...(changedFiles
      ? [
          "<details>",
          "<summary>Changed Files</summary>",
          "",
          "```",
          changedFiles,
          "```",
          "",
          "</details>",
        ]
      : []),
  ].join("\n");

/** Issue kanban-style completion comment -- minimal. */
export const renderIssueCompletionComment = (
  prNumber: number,
  status: "completed" | "failed",
): string =>
  [
    BOT_MARKER,
    "",
    `Auto-Dev ${status === "completed" ? "completed" : "failed"}. See PR #${prNumber} for details.`,
    `**Status**: ${status}`,
  ].join("\n");

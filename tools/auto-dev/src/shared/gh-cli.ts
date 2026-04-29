import { execFileSync } from "node:child_process";

import { getAuthEnv } from "./github-app-auth.js";
import {
  GhIssueSchema,
  GhPRSchema,
  GhCommentSchema,
  type GhIssue,
  type GhPR,
  type GhComment,
} from "./schemas.js";

export type { GhIssue, GhPR, GhComment } from "./schemas.js";

const gh = (args: string[], opts?: { cwd?: string }): string => {
  try {
    const authEnv = getAuthEnv();
    return execFileSync("gh", args, {
      encoding: "utf-8",
      cwd: opts?.cwd,
      env: { ...process.env, ...authEnv },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`gh CLI error (${args[0]}): ${message}`);
  }
};

export const listIssues = (
  repo: string,
  label: string,
  limit = 25,
): GhIssue[] => {
  const output = gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--label",
    label,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,title,labels,body",
  ]);
  return GhIssueSchema.array().parse(JSON.parse(output));
};

export const getIssue = (repo: string, issueNumber: number): GhIssue => {
  const output = gh([
    "issue",
    "view",
    String(issueNumber),
    "--repo",
    repo,
    "--json",
    "number,title,labels,body",
  ]);
  return GhIssueSchema.parse(JSON.parse(output));
};

export const createComment = (
  repo: string,
  issueNumber: number,
  body: string,
): void => {
  gh(["issue", "comment", String(issueNumber), "--repo", repo, "--body", body]);
};

export const updateIssueLabels = (
  repo: string,
  issueNumber: number,
  labels: string[],
): void => {
  gh([
    "issue",
    "edit",
    String(issueNumber),
    "--repo",
    repo,
    "--add-label",
    labels.join(","),
  ]);
};

export const removeIssueLabels = (
  repo: string,
  issueNumber: number,
  labels: string[],
): void => {
  gh([
    "issue",
    "edit",
    String(issueNumber),
    "--repo",
    repo,
    "--remove-label",
    labels.join(","),
  ]);
};

export const createPR = (
  repo: string,
  title: string,
  body: string,
  head: string,
  base = "main",
): { number: number; url: string } => {
  const output = gh([
    "pr",
    "create",
    "--repo",
    repo,
    "--title",
    title,
    "--body",
    body,
    "--head",
    head,
    "--base",
    base,
  ]);
  const match = output.match(/\/pull\/(\d+)/);
  return { number: match ? parseInt(match[1], 10) : 0, url: output };
};

export const mergePR = (
  repo: string,
  prNumber: number,
  method: "merge" | "squash" | "rebase" = "merge",
): void => {
  gh(["pr", "merge", String(prNumber), `--${method}`, "--repo", repo]);
};

export const listPRs = (
  repo: string,
  _state: "open" | "closed" | "merged" = "open",
): GhPR[] => {
  const output = gh([
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    _state,
    "--json",
    "number,title,headRefName",
  ]);
  return GhPRSchema.array().parse(JSON.parse(output));
};

export const getPRStatus = (repo: string, prNumber: number): string => {
  return gh([
    "pr",
    "view",
    String(prNumber),
    "--repo",
    repo,
    "--json",
    "state,mergeable,reviews",
  ]);
};

export const listIssueComments = (
  repo: string,
  issueNumber: number,
): GhComment[] => {
  const output = gh(["api", `repos/${repo}/issues/${issueNumber}/comments`]);
  return GhCommentSchema.array().parse(JSON.parse(output));
};

export const listPRComments = (repo: string, prNumber: number): GhComment[] => {
  const output = gh(["api", `repos/${repo}/issues/${prNumber}/comments`]);
  return GhCommentSchema.array().parse(JSON.parse(output));
};
